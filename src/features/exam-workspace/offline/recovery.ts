const key = (path: string) => `exam-recovery:${path.replace(/\/$/, "")}`;

export const enableOfflineRecovery = (
  examId: string,
  id: string,
  questions: string[],
) => {
  if (!("serviceWorker" in navigator)) return;
  try {
    sessionStorage.setItem(
      key(`/student/exams/${examId}`),
      JSON.stringify({ id, questions }),
    );
    void navigator.serviceWorker
      .register("/exam-recovery-worker.js", { scope: "/student/exams/" })
      .catch(() => undefined);
  } catch {
    // The current workspace can still use its IndexedDB answer queue.
  }
};

export const clearOfflineRecovery = (attemptId: string) => {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const name = sessionStorage.key(index);
      if (!name?.startsWith("exam-recovery:")) continue;
      const entry = JSON.parse(sessionStorage.getItem(name) ?? "null");
      if (entry?.id === attemptId) sessionStorage.removeItem(name);
    }
  } catch {
    // Local storage can be disabled by the browser.
  }
};
