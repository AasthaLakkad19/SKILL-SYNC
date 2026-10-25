/* SkillSync theme helper (settings.html expects window.SkillSyncTheme).
   Stores the choice in localStorage and sets data-theme on <html>. */
(function () {
  var KEY = "skillsync_theme";

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function current() {
    return localStorage.getItem(KEY) || "system";
  }

  function apply(theme) {
    theme = theme || "system";
    localStorage.setItem(KEY, theme);
    document.documentElement.setAttribute(
      "data-theme",
      theme === "system" ? systemTheme() : theme
    );
  }

  window.SkillSyncTheme = { current: current, apply: apply };
  apply(current());
})();
