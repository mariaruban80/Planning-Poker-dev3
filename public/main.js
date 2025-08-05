
// (Original content truncated for brevity)
// --- ADDED CSV MODAL SUPPORT ---
function showCSVImportModal() {
  const modal = document.getElementById("csvImportModal");
  if (modal) modal.style.display = "flex";
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const csvText = e.target.result;
    const rows = csvText.split("\n").map(row => row.split(","));
    const headers = rows[0];
    const sampleData = rows[1] || [];

    const mappingContainer = document.getElementById("csvFieldMapping");
    mappingContainer.innerHTML = "";
    headers.forEach((header, i) => {
      const label = document.createElement("label");
      label.textContent = `Map "${header}" to:`;
      const select = document.createElement("select");
      select.innerHTML = \`
        <option value="ignore">Ignore</option>
        <option value="id">ID</option>
        <option value="title">Title</option>
        <option value="description">Description</option>
      \`;
      mappingContainer.appendChild(label);
      mappingContainer.appendChild(select);
    });
  };
  reader.readAsText(file);
  document.getElementById("csvConfirmSection").style.display = "block";
}
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("csvUploadTriggerBtn")?.addEventListener("click", showCSVImportModal);
  document.getElementById("csvInputModal")?.addEventListener("change", handleCSVUpload);
});
