"""
Resilience patterns: retry logic with exponential backoff and circuit breaker
"""

import time
import logging
from functools import wraps
from typing import Callable, TypeVar, Any
from enum import Enum

logger = logging.getLogger()

F = TypeVar('F', bound=Callable[..., Any])


class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing - reject requests fast
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """Circuit breaker pattern to prevent cascading failures"""
    
    def __init__(self, failure_threshold: int = 5, timeout_seconds: int = 60, recovery_timeout: int = 30):
        """
        Initialize circuit breaker.
        
        Args:
            failure_threshold: Number of failures before opening circuit
            timeout_seconds: How long to keep circuit open
            recovery_timeout: Time to wait in half-open state before trying again
        """
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.recovery_timeout = recovery_timeout
        
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.half_open_attempts = 0
        
    def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection"""
        
        # Check if we need to transition from OPEN to HALF_OPEN
        if self.state == CircuitBreakerState.OPEN:
            if self._should_attempt_reset():
                logger.info("🔌 CIRCUIT BREAKER: Transitioning to HALF_OPEN - attempting recovery")
                self.state = CircuitBreakerState.HALF_OPEN
                self.half_open_attempts = 0
            else:
                raise CircuitBreakerOpenError(f"Circuit breaker is OPEN (failures: {self.failure_count}/{self.failure_threshold})")
        
        # Try to execute
        try:
            result = func(*args, **kwargs)
            
            # Success - reset if we were in HALF_OPEN
            if self.state == CircuitBreakerState.HALF_OPEN:
                logger.info("🔌 CIRCUIT BREAKER: Recovery successful - closing circuit")
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
                
            return result
            
        except Exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            logger.warning(f"⚠️ CIRCUIT BREAKER: Failure {self.failure_count}/{self.failure_threshold}: {str(e)}")
            
            if self.state == CircuitBreakerState.HALF_OPEN:
                logger.error(f"🔴 CIRCUIT BREAKER: Failure during recovery - reopening circuit")
                self.state = CircuitBreakerState.OPEN
                self.half_open_attempts = 0
            
            elif self.failure_count >= self.failure_threshold:
                logger.error(f"🔴 CIRCUIT BREAKER: Failure threshold reached - OPENING circuit")
                self.state = CircuitBreakerState.OPEN
            
            raise
    
    def _should_attempt_reset(self) -> bool:
        """Check if we should try to recover from open state"""
        if self.last_failure_time is None:
            return False
        
        elapsed = time.time() - self.last_failure_time
        return elapsed >= self.timeout_seconds
    
    def get_state(self) -> dict:
        """Get circuit breaker state for logging/monitoring"""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "threshold": self.failure_threshold,
            "last_failure_time": self.last_failure_time,
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open"""
    pass


def retry_with_backoff(max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 30.0):
    """
    Decorator for retry logic with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            delay = base_delay
            
            for attempt in range(max_retries + 1):
                try:
                    logger.info(f"🔄 RETRY: Attempt {attempt + 1}/{max_retries + 1} for {func.__name__}")
                    result = func(*args, **kwargs)
                    
                    if attempt > 0:
                        logger.info(f"✅ RETRY: Succeeded on attempt {attempt + 1}")
                    
                    return result
                    
                except Exception as e:
                    last_exception = e
                    
                    if attempt < max_retries:
                        # Exponential backoff with jitter
                        import random
                        jitter = random.uniform(0, 0.1 * delay)
                        actual_delay = min(delay + jitter, max_delay)
                        
                        logger.warning(
                            f"⚠️ RETRY: Attempt {attempt + 1} failed ({str(e).__class__.__name__}): "
                            f"{str(e)[:100]}... - Retrying in {actual_delay:.2f}s"
                        )
                        time.sleep(actual_delay)
                        delay *= 2  # Exponential backoff
                    else:
                        logger.error(
                            f"❌ RETRY: All {max_retries + 1} attempts failed for {func.__name__}"
                        )
            
            # All retries exhausted
            raise last_exception if last_exception else Exception(f"{func.__name__} failed after {max_retries + 1} attempts")
        
        return wrapper
    return decorator


# Global circuit breakers for different services
appync_circuit_breaker = CircuitBreaker(
    failure_threshold=3,
    timeout_seconds=60,
    recovery_timeout=30
)

bedrock_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    timeout_seconds=45,
    recovery_timeout=20
)

db_circuit_breaker = CircuitBreaker(
    failure_threshold=4,
    timeout_seconds=60,
    recovery_timeout=30
)
