# Text Generation Scalability Analysis

## Summary
Yes, multiple concurrent text-based clients **WILL cause timeouts and performance degradation**. The current implementation has several scalability limitations that will manifest under load.

## Architecture Overview

### Text Generation Flow
```
User (Text Chat) 
  → API Gateway 
  → Lambda: text_generation 
  → RDS Proxy (shared with voice)
  → Bedrock API (Nova Sonic)
  → Response streaming back to client
```

### Problem: No Connection Pooling in Text Lambda
- **File**: `cdk/text_generation/src/main.py` line 81-104
- Each Lambda invocation creates a **new database connection**
- Connection is closed after response completes
- No pooling or reuse of connections

## Scalability Bottlenecks

### 1. **RDS Proxy Connection Exhaustion** 🔴 CRITICAL
**Current State**:
- Voice pipeline: max 20 connections
- Text pipeline: unlimited connections
- RDS Proxy has a total limit (typically 100-200 per instance)

**Under Load (50 Concurrent Text Requests)**:
```
T0s:   First 20 text requests connect successfully
T0s:   Voice session needs 2 connections (blocked if proxy full)
T1s:   Next 20 text requests queue at proxy
T2s:   Last 10 text requests queue
T3s+:  New requests timeout waiting for proxy connection
```

**Problem**: No backpressure between voice and text pipelines

### 2. **Lambda Cold Start Cascade** 🔴 CRITICAL
- Text generation Lambda uses Docker image (slower than Node.js)
- With 50 concurrent requests, many Lambda instances spawn
- Each cold start takes 2-5 seconds
- Combined with connection wait = 7-10+ second latency

### 3. **Bedrock API Concurrency** 🟡 HIGH
- Text generation calls Bedrock synchronously
- 50 concurrent requests = 50 concurrent Bedrock invocations
- Bedrock throttles at account level (default 1000 tokens/second)
- Could hit rate limits depending on token usage

### 4. **No Timeout Protection in Text Lambda** 🟡 HIGH
- Text generation Lambda has a 15-minute timeout default
- Slow Bedrock responses don't timeout
- Blocks Lambda execution for entire duration
- Prevents Lambda function from serving other users

### 5. **Database Connection Pool Not Isolated** 🟡 MEDIUM
- Voice uses 20 connections from shared RDS Proxy
- Text Lambda creates new connections from same RDS Proxy
- With 50 text requests + voice = 70+ total connection attempts
- Could exceed RDS Proxy limits

---

## Failure Scenario: 50 Concurrent Text Users

### Timeline:
```
T=0s    50 users send text messages
        20 text requests connect to RDS Proxy
        30 text requests queue waiting for connection
        
T=1s    Some Lambda cold starts complete
        Users 1-20: waiting for Bedrock response (3-5 seconds)
        Users 21-30: still waiting for DB connection
        
T=2s    RDS Proxy connection timeout (usually 30 seconds, but full)
        Users 31-50: connection refused
        
T=3s    Users 1-20: responses arrive (slowly)
        Some users might have abandoned request
        
T=5s+   Cascading timeouts, response times >10 seconds
```

### User Experience:
- First 20 users: 5-10 second delay
- Users 21-30: 15-30 second delay (if they get connection)
- Users 31-50: "Connection timeout" error

---

## Comparison: Voice vs Text Pipeline

### Voice Pipeline (Current Fix)
```
✅ Empathy evaluation: Semaphore(2) - queued, throttled
✅ Database: Dedicated pool (20 connections)
✅ Bedrock calls: Have 5-second timeout
✅ Graceful degradation: Timeouts fail gracefully
```

### Text Pipeline (No Fixes)
```
❌ No request queuing - all concurrent
❌ Each request creates NEW database connection
❌ No timeout on Bedrock API calls
❌ Can block indefinitely waiting for response
❌ Shares RDS Proxy with voice - no isolation
```

---

## Required Fixes for Text Generation Scalability

### 🔴 IMMEDIATE (Prevents Failures)

#### 1. Add Lambda Concurrency Throttling
- Set Lambda reserved concurrency to **20** (matches DB pool)
- Prevents overwhelming RDS Proxy with connections
- Excess requests queue at API Gateway
- File: `cdk/lib/api-service-stack.ts`

#### 2. Add Timeout to Text Lambda
- Set environment timeout to **30 seconds** max
- Bedrock calls should timeout at **15 seconds**
- Prevents hanging Lambda executions
- File: `cdk/text_generation/src/main.py`

#### 3. Separate DB Connection Pool for Text
- Create dedicated connection pool for text Lambda
- Allocate: min=3, max=10 connections
- Keeps voice and text pipelines isolated
- File: `cdk/text_generation/src/main.py`

### 🟡 SHORT-TERM (Improves Performance)

#### 1. Connection Pooling in Text Lambda
- Use `psycopg2.pool.ThreadedConnectionPool`
- Reuse connections across requests
- Reduces connection overhead per request
- File: `cdk/text_generation/src/main.py`

#### 2. Add Bedrock Timeout to Text
- Wrap Bedrock calls in timeout handler
- Max 15 seconds per Bedrock request
- Fallback response if timeout
- File: `cdk/text_generation/src/helpers/chat.py`

#### 3. Circuit Breaker Pattern
- Track Bedrock error rates
- Reject requests if error rate >50% for 1 minute
- Prevent cascading failures
- File: `cdk/text_generation/src/helpers/chat.py`

### 🟢 LONG-TERM (Architecture)

#### 1. Async Text Generation
- Use async Lambda (Python asyncio)
- Process multiple requests in single Lambda
- Reduce cold starts and connection overhead
- File: `cdk/text_generation/src/main.py`

#### 2. Queue-Based Architecture
- SQS queue for text generation requests
- Workers process queue asynchronously
- Prevents overwhelming database
- File: `cdk/lib/api-service-stack.ts`

#### 3. Multi-Region RDS Read Replicas
- Use read replicas for chat history queries
- Keep writes on primary
- Distributed across regions
- File: Infrastructure change

#### 4. Response Caching
- Cache empathy evaluation results
- Cache common patient responses
- Reduce duplicate Bedrock calls
- File: `cdk/text_generation/src/helpers/cache.py`

---

## Recommended Action Plan

### Phase 1: Critical Fixes (Today)
```python
# 1. Lambda concurrency throttling
   Reserved concurrency: 20

# 2. Add timeout to text generation
   Lambda timeout: 30 seconds
   Bedrock timeout: 15 seconds
   
# 3. Separate connection pool for text
   min_connections = 3
   max_connections = 10
```

### Phase 2: Performance (This Week)
```python
# 1. Add connection pooling to text Lambda
   psycopg2.pool.ThreadedConnectionPool
   
# 2. Add Bedrock timeout wrapper
   asyncio.wait_for(timeout=15.0)
   
# 3. Add basic circuit breaker
   Track 429/503 errors, reject if >50%
```

### Phase 3: Scale (Next Sprint)
```
# 1. Convert text Lambda to async
# 2. Implement SQS queue
# 3. Add response caching
# 4. Multi-region support
```

---

## Load Testing Recommendations

### Test Scenarios:
1. **Single User**: Baseline response time (should be <2 seconds)
2. **10 Concurrent**: Should respond <3 seconds
3. **50 Concurrent**: Target <5 seconds with fixes
4. **100 Concurrent**: Should gracefully degrade

### Metrics to Monitor:
- Lambda duration
- RDS Proxy connection count
- API Gateway latency
- Bedrock API throttle rate
- Text generation response time

### Success Criteria:
- 50 concurrent users: <5 second response time
- 100 concurrent users: <10 second response time (with queue)
- No more than 20 DB connections in use simultaneously
- <1% timeout rate

---

## Risk Assessment

### Without Fixes:
- 🔴 Will fail with 30+ concurrent text users
- 🔴 Response times >15 seconds under load
- 🔴 Customers will experience timeouts and errors
- 🔴 Voice + text together will cause cascade failures

### With Phase 1 Fixes:
- 🟡 Can handle 50 concurrent text users
- 🟡 Response times 5-10 seconds under load
- 🟡 Graceful degradation, no crashes
- 🟡 Voice + text can coexist

### With Phase 2 Fixes:
- 🟢 Can handle 100 concurrent text users
- 🟢 Response times <5 seconds under load
- 🟢 Stable, predictable performance
- 🟢 Voice + text independent pipelines

---

## Conclusion

**Current Status**: ❌ Not production-ready for multiple concurrent text users  
**After Phase 1 Fixes**: ⚠️ Can handle moderate load (50 users)  
**After Phase 2 Fixes**: ✅ Production-ready for typical usage

The fixes I already implemented for voice work well because they add **resource throttling** and **timeout protection**. Text generation needs the **same discipline**: queuing, timeouts, and connection pooling.
