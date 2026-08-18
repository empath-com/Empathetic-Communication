import { useEffect, useState } from "react";
import { apiGet } from "../../../utils/apiClient";

const emptyFilters = {
  simulationGroupId: null,
  patientId: null,
  studentUserId: null,
};

export default function useInstructorAnalytics(initialSimulationGroupId) {
  const [filters, setFilters] = useState({
    ...emptyFilters,
    simulationGroupId: initialSimulationGroupId || null,
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setFilters({ ...emptyFilters, simulationGroupId: initialSimulationGroupId || null });
  }, [initialSimulationGroupId]);

  useEffect(() => {
    let cancelled = false;

    const loadReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet("instructor/analytics", {
          simulation_group_id: filters.simulationGroupId,
          patient_id: filters.patientId,
          student_user_id: filters.studentUserId,
        });
        if (!cancelled) setReport(data);
      } catch (requestError) {
        if (!cancelled) setError("Analytics could not be loaded. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  const updateFilter = (name, value) => {
    setFilters((current) => {
      if (name === "simulationGroupId") {
        return { ...emptyFilters, simulationGroupId: value || null };
      }
      if (name === "patientId") {
        return { ...current, patientId: value || null, studentUserId: null };
      }
      return { ...current, [name]: value || null };
    });
  };

  return {
    filters,
    report,
    loading,
    error,
    updateFilter,
    clearFilters: () => setFilters(emptyFilters),
    reload: () => setReloadToken((token) => token + 1),
  };
}