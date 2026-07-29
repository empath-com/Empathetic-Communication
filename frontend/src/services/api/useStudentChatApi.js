import { useMemo } from "react";
import { createApiClient } from "../../utils/apiClient";
import { createStudentChatApi } from "./studentChatApi";

export default function useStudentChatApi(getAuth) {
  const apiClient = useMemo(
    () =>
      createApiClient({
        tokenProvider: async () => {
          const { token } = await getAuth();
          return token;
        },
      }),
    [getAuth]
  );

  const studentApi = useMemo(() => createStudentChatApi(apiClient), [apiClient]);
  return { apiClient, studentApi };
}
