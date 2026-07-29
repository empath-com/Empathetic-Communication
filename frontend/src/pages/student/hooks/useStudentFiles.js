import { useCallback, useEffect, useState } from "react";

export default function useStudentFiles({ group, patient, studentApi }) {
  const [patientInfoFiles, setPatientInfoFiles] = useState([]);
  const [isInfoLoading, setIsInfoLoading] = useState(false);
  const [answerKeyFiles, setAnswerKeyFiles] = useState([]);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);

  const fetchFiles = useCallback(async () => {
    if (!group?.simulation_group_id || !patient?.patient_id) return;

    setIsInfoLoading(true);
    setIsAnswerLoading(true);
    try {
      const data = await studentApi.fetchPatientFiles({
        simulationGroupId: group.simulation_group_id,
        patientId: patient.patient_id,
        patientName: patient.patient_name,
      });

      setPatientInfoFiles(data.infoFiles);
      setAnswerKeyFiles(data.answerFiles);
      setProfilePicture(data.profilePicture);
    } catch (error) {
      console.error("Error fetching patient info files:", error);
    } finally {
      setIsInfoLoading(false);
      setIsAnswerLoading(false);
    }
  }, [group, patient, studentApi]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    patientInfoFiles,
    isInfoLoading,
    answerKeyFiles,
    isAnswerLoading,
    profilePicture,
    setProfilePicture,
    fetchFiles,
  };
}
