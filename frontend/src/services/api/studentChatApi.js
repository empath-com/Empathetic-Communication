export function createStudentChatApi(client) {
  const ensureClient = client;

  return {
    getPatientSessions({ email, simulationGroupId, patientId }) {
      return ensureClient.get("student/patient", {
        email,
        simulation_group_id: simulationGroupId,
        patient_id: patientId,
      });
    },

    deleteSession({ email, simulationGroupId, patientId, sessionId }) {
      return ensureClient.delete("student/delete_session", {
        email,
        simulation_group_id: simulationGroupId,
        patient_id: patientId,
        session_id: sessionId,
      });
    },

    async fetchPatientFiles({ simulationGroupId, patientId, patientName }) {
      const data = await ensureClient.get("student/get_all_files", {
        simulation_group_id: simulationGroupId,
        patient_id: patientId,
        patient_name: patientName,
      });

      const infoFiles = Object.entries(data.info_files || {}).map(([fileName, fileDetails]) => ({
        name: fileName,
        url: fileDetails.url,
        type: fileName.split(".").pop().toLowerCase(),
        metadata: fileDetails.metadata,
      }));

      const answerFiles = Object.entries(data.answer_key_files || {}).map(([fileName, fileDetails]) => ({
        name: fileName,
        url: fileDetails.url,
        type: fileName.split(".").pop().toLowerCase(),
        metadata: fileDetails.metadata,
      }));

      const profilePic = data.profile_picture_url;
      const profileUrl =
        typeof profilePic === "string"
          ? profilePic
          : profilePic?.url || profilePic?.profile_picture_url || null;

      return {
        infoFiles,
        answerFiles,
        profilePicture: profileUrl || null,
      };
    },

    async fetchPatientVoiceId(patientId) {
      if (!patientId) return "tiffany";
      const data = await ensureClient.get("student/patient_voice_id", { patient_id: patientId });
      return data?.voice_id || "tiffany";
    },

    createSession({ email, simulationGroupId, patientId, sessionName }) {
      return ensureClient.post(
        "student/create_session",
        undefined,
        {
          email,
          simulation_group_id: simulationGroupId,
          patient_id: patientId,
          session_name: sessionName,
        }
      );
    },

    deleteLastMessage(sessionId) {
      return ensureClient.delete("student/delete_last_message", {
        session_id: sessionId,
      });
    },

    createMessage({ sessionId, email, simulationGroupId, patientId, messageContent }) {
      return ensureClient.post(
        "student/create_message",
        { message_content: messageContent },
        {
          session_id: sessionId,
          email,
          simulation_group_id: simulationGroupId,
          patient_id: patientId,
        }
      );
    },

    getMessages(sessionId) {
      return ensureClient.get("student/get_messages", { session_id: sessionId });
    },

    textGenerationStream({ simulationGroupId, sessionId, patientId, sessionName, messageId, messageContent }) {
      return ensureClient.post(
        "student/text_generation",
        { message_content: messageContent },
        {
          simulation_group_id: simulationGroupId,
          session_id: sessionId,
          patient_id: patientId,
          session_name: sessionName,
          stream: "true",
          ...(messageId ? { message_id: messageId } : {}),
        }
      );
    },

    evaluateEmpathy({ sessionId, patientId, simulationGroupId, messageId, messageContent }) {
      return ensureClient.post(
        "student/empathy_evaluation",
        { message_content: messageContent },
        {
          session_id: sessionId,
          patient_id: patientId,
          simulation_group_id: simulationGroupId,
          ...(messageId ? { message_id: messageId } : {}),
        }
      );
    },

    updatePatientScore({ patientId, studentEmail, simulationGroupId, llmVerdict }) {
      return ensureClient.post(
        "student/update_patient_score",
        undefined,
        {
          patient_id: patientId,
          student_email: studentEmail,
          simulation_group_id: simulationGroupId,
          llm_verdict: String(Boolean(llmVerdict)),
        }
      );
    },

    createStudentUserProfile({ userEmail, username, firstName, lastName, preferredName }) {
      return ensureClient.post("student/create_user", undefined, {
        user_email: userEmail,
        username,
        first_name: firstName,
        last_name: lastName,
        preferred_name: preferredName,
      });
    },
  };
}
