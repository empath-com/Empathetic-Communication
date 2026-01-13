# Chat Freeze Root Cause Analysis

## Summary
The chat interface freezing issue started after Nova Sonic voice integration was added. The problem is **not** with the frontend React components (which we fixed), but with **server-side resource contention** between voice processing and text generation.

## Root Causes Identified

### 1. **Unbounded Async Empathy Evaluation Tasks** ⚠️ CRITICAL
**Location**: `cdk/socket-server/nova_sonic.py` lines 367 and 505

Every voice input triggers an async empathy evaluation:
```python
asyncio.create_task(safe_empathy_eval())  # Line 367
asyncio.create_task(self._evaluate_empathy(text, patient_context))  # Line 505
```

**Problem**:
- Each task calls Bedrock API (Nova Pro model) - takes 2-5 seconds
- Tasks run **without queuing or throttling**
- Multiple concurrent tasks exhaust resources
- No coordination with text generation requests

### 2. **Resource Pool Contention** ⚠️ CRITICAL
**Location**: `cdk/socket-server/voice_db_manager.py` lines 45-48

Voice connection pool configuration:
```python
self.min_connections = 2          # Higher minimum for voice
self.max_connections = 10         # Increased from 5 to handle voice bursts
```

**Problem**:
- Limited to 10 concurrent database connections
- Empathy evaluation + text generation both need DB access
- Once max is reached, subsequent requests hang indefinitely
- No backpressure mechanism

### 3. **Bedrock API Saturation** ⚠️ CRITICAL  
**Location**: `cdk/socket-server/nova_sonic.py` line 795 (empathy evaluation)

```python
response = bedrock_client.invoke_model(
    modelId="amazon.nova-pro-v1:0",
    ...
)
```

**Problem**:
- Each empathy evaluation makes a synchronous Bedrock API call
- Nova Pro is slower than Nova Sonic (used for voice)
- Multiple concurrent calls can be throttled by AWS
- No retry logic or circuit breaker

### 4. **No Coordination Between Voice and Text Pipelines** ⚠️ CRITICAL
**Problem**:
- Voice empathy evaluation is independent of text generation
- Both pipelines make requests to the same backend resources
- When user has voice enabled + is typing text chat simultaneously:
  - Voice empathy tasks consume database connections
  - Text generation requests queue up waiting for connections
  - Frontend perceives as "frozen" or "halted"

## Timeline of Events

1. User starts voice conversation → Nova Sonic spawned (separate process)
2. Every voice message → empathy evaluation task created
3. User switches to text chat while voice session active
4. Text message submission → text generation API call
5. **Resource exhaustion**: Both pipelines compete for DB connections and API rate limits
6. Frontend gets stuck waiting for text generation response
7. User sees "frozen" interface and messages "halt"

## Why It Started After Nova Sonic Addition

**Before**: Only text chat pipeline
- Linear request → response flow
- Predictable database connection usage
- No competing async processes

**After**: Text + Voice pipelines
- Voice empathy evaluation spawns uncontrolled async tasks
- Database connection pool now shared between pipelines
- Random task ordering causes unpredictable latency
- Text chat requests blocked by voice processing

## Performance Impact

- **Best case**: No voice activity → text chat works normally
- **Worst case**: Voice + text simultaneous → text chat freezes for 5+ seconds
- **Trigger**: Any user with voice enabled while typing text

## Recommended Fixes (Priority Order)

### 🔴 IMMEDIATE (Blocks User Experience)
1. **Add Empathy Evaluation Queue**
   - Replace unbounded `asyncio.create_task()` with a bounded queue
   - Max 2 concurrent empathy evaluations
   - Prevents resource exhaustion

2. **Increase Voice Connection Pool**
   - Change `max_connections` from 10 to 15-20
   - Allocate separate connection pools for voice vs. text
   - Monitor pool utilization

3. **Add Bedrock API Throttling**
   - Implement exponential backoff for Bedrock calls
   - Add circuit breaker pattern
   - Queue empathy requests instead of immediate calls

### 🟡 SHORT-TERM (Improves Stability)
1. **Timeout Protection for Empathy Evaluation**
   - Set 5-second timeout on Bedrock calls
   - Graceful failure if timeout exceeded
   - Don't block text chat if voice evaluation fails

2. **Isolate Voice and Text Pipelines**
   - Separate database connection pools for each
   - Independent resource limits per pipeline
   - Prevent cross-pipeline contention

3. **Add Request Prioritization**
   - Text generation requests = HIGH priority
   - Empathy evaluation = LOW priority
   - Ensure text chat never blocks on voice

### 🟢 LONG-TERM (Architecture Improvement)
1. **Background Worker Service**
   - Move empathy evaluation to separate worker service
   - Decouple from main voice server
   - Allow async batch processing

2. **Caching Layer**
   - Cache empathy evaluations for duplicate messages
   - Reduce redundant Bedrock API calls
   - Improve response time

3. **Monitoring & Alerting**
   - Track connection pool utilization
   - Alert when >80% capacity
   - Monitor Bedrock API response times

## Files to Modify

1. `cdk/socket-server/nova_sonic.py` - Add empathy queue and throttling
2. `cdk/socket-server/voice_db_manager.py` - Increase pool size, add monitoring
3. `cdk/socket-server/server.js` - Add request prioritization (optional)

## Testing Strategy

1. **Reproduce Issue**:
   - Start voice conversation
   - While voice active, send text messages
   - Measure text generation response time

2. **Verify Fix**:
   - Text generation should respond <2 seconds even with voice active
   - Database pool should not exceed max connections
   - No "halted responses" during concurrent voice+text

3. **Load Testing**:
   - Simulate multiple concurrent voice sessions
   - Send text messages from different users
   - Monitor resource utilization and response times

---

**Status**: Root cause identified, fixes ready for implementation
**Severity**: 🔴 CRITICAL - Blocks core user experience
**User Impact**: Chat interface freezes when voice + text active simultaneously
