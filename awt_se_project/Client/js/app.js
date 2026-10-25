var app = angular.module("skillSyncApp", []);

// ============================================================
// AUTH: page guard + automatic Bearer token on every /api call
// ============================================================
(function () {
  var PUBLIC_PAGES = ["", "index.html", "login.html", "signup.html"];

  function currentPage() {
    return (window.location.pathname.split("/").pop() || "").toLowerCase();
  }

  function clearSession() {
    localStorage.removeItem("skillsync_token");
    localStorage.removeItem("skillsync_user");
  }

  // Not logged in -> can't view a private page
  if (
    PUBLIC_PAGES.indexOf(currentPage()) === -1 &&
    !localStorage.getItem("skillsync_token")
  ) {
    window.location.replace("login.html");
  }

  app.factory("authInterceptor", function ($q) {
    return {
      request: function (config) {
        var token = localStorage.getItem("skillsync_token");
        var isApi = config.url && config.url.indexOf("/api/") !== -1;

        if (token && isApi) {
          config.headers = config.headers || {};
          if (!config.headers.Authorization) {
            config.headers.Authorization = "Bearer " + token;
          }
        }
        return config;
      },

      responseError: function (rejection) {
        var url = (rejection.config && rejection.config.url) || "";

        // Expired / invalid token (login & register also return 401/400 for
        // bad credentials, so don't treat those as a session expiry).
        if (rejection.status === 401 && url.indexOf("/api/auth/") === -1) {
          clearSession();
          if (PUBLIC_PAGES.indexOf(currentPage()) === -1) {
            window.location.replace("login.html");
          }
        }
        return $q.reject(rejection);
      },
    };
  });

  app.config(function ($httpProvider) {
    $httpProvider.interceptors.push("authInterceptor");
  });
})();
