(() => {
  const status = document.getElementById("status");
  document
    .getElementById("reload")
    .addEventListener("click", () => location.reload());
  window.addEventListener("online", () => location.reload(), { once: true });

  let attempt;
  try {
    attempt = JSON.parse(
      sessionStorage.getItem(
        `exam-recovery:${location.pathname.replace(/\/$/, "")}`,
      ) ?? "null",
    );
  } catch {
    status.textContent = "Local recovery is unavailable in this tab.";
    return;
  }
  if (!attempt || !Array.isArray(attempt.questions)) {
    status.textContent = "This tab has no examination recovery session.";
    return;
  }

  const db = indexedDB.open("exam-offline-answers");
  db.onupgradeneeded = () => db.transaction.abort();
  db.onerror = () => {
    status.textContent = "Local answers could not be loaded.";
  };
  db.onsuccess = () => {
    const opened = db.result;
    const transaction = opened.transaction("answers", "readonly");
    const rows = transaction
      .objectStore("answers")
      .index("by-attempt")
      .getAll(attempt.id);
    transaction.oncomplete = () => opened.close();
    rows.onerror = () => {
      status.textContent = "Local answers could not be loaded.";
    };
    rows.onsuccess = () => {
      const pending = new Map(
        rows.result
          .filter((row) => row.syncStatus !== "synced")
          .map((row) => [row.questionId, row.text]),
      );
      const answers = document.getElementById("answers");
      attempt.questions.forEach((id, index) => {
        if (!pending.has(id)) return;
        const item = document.createElement("li");
        item.textContent = `Question ${index + 1}\n${pending.get(id) || "(Cleared answer)"}`;
        answers.append(item);
      });
      document.getElementById("drafts").hidden =
        answers.childElementCount === 0;
      status.textContent = answers.childElementCount
        ? `${answers.childElementCount} pending answers are stored in this browser.`
        : "There are no pending answers for this attempt.";
    };
  };
})();
