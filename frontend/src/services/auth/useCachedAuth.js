import { useCallback, useRef } from "react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";

export default function useCachedAuth() {
  const authCacheRef = useRef({ token: null, exp: 0, email: null });

  const getAuth = useCallback(async () => {
    const now = Date.now() / 1000;
    const current = authCacheRef.current;

    if (current.token && current.exp - 60 > now && current.email) {
      return current;
    }

    const authSession = await fetchAuthSession();
    const token = authSession.tokens.idToken;
    const exp = authSession.tokens?.idToken?.payload?.exp || now + 300;
    const { email } = await fetchUserAttributes();
    const updated = { token, exp, email };
    authCacheRef.current = updated;
    return updated;
  }, []);

  return { getAuth };
}
