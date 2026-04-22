/**
 * Shared loading UI helpers for dashboard pages.
 *
 * This keeps page transitions and fetch states consistent across the
 * overview and all detail tables without introducing a frontend framework.
 */

(function bootstrapLoadingUi() {
  const body = document.body;
  const panel = document.querySelector(".panel");
  const tableBody = document.getElementById("rows");
  const emptyState = document.getElementById("empty");
  const countEl = document.getElementById("count");

  let hydrated = false;

  function showPageIntro() {
    requestAnimationFrame(() => {
      body.classList.add("page--ready");
    });
  }

  function getColumnCount() {
    return Math.max(document.querySelectorAll(".pc-table thead th").length, 1);
  }

  function buildSkeletonWidth(columnIndex, columnCount) {
    if (columnIndex === columnCount - 1) return "56px";
    if (columnIndex === 0) return "72%";
    if (columnIndex === 1) return "86px";
    return "64%";
  }

  function renderSkeletonRows(rowCount = 7) {
    if (!tableBody) return;

    const columnCount = getColumnCount();
    const rows = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const cells = [];

      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const width = buildSkeletonWidth(columnIndex, columnCount);
        cells.push(
          `<td><span class="skeleton-block" style="width:${width}"></span></td>`,
        );
      }

      rows.push(`<tr class="skeleton-row" aria-hidden="true">${cells.join("")}</tr>`);
    }

    tableBody.innerHTML = rows.join("");

    if (emptyState) {
      emptyState.hidden = true;
    }

    if (countEl) {
      countEl.textContent = "Loading...";
    }
  }

  function startFetch() {
    if (panel) {
      panel.classList.add("panel--loading");
    }

    if (tableBody && !hydrated) {
      renderSkeletonRows();
    }
  }

  function finishFetch() {
    hydrated = true;

    if (panel) {
      panel.classList.remove("panel--loading");
    }
  }

  showPageIntro();

  window.DashboardLoadingUI = {
    finishFetch,
    renderSkeletonRows,
    resetHydration() {
      hydrated = false;
    },
    startFetch,
  };
})();
