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


// ============================================================
// auth-src: <img auth-src="/api/..."> for images behind the login.
// A plain <img src> can't send the Bearer token, so the image is fetched
// with $http (token added by the interceptor) and shown from a blob URL.
// auth-src-error="expr" runs if there is no image (the page then shows the
// first letter of the name instead).
// ============================================================
app.directive("authSrc", [
  "$http",
  function ($http) {
    return {
      restrict: "A",
      link: function (scope, element, attrs) {
        var objectUrl = null;

        function release() {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
        }

        attrs.$observe("authSrc", function (url) {
          release();
          element.removeAttr("src");
          if (!url) return;

          $http
            .get(url, { responseType: "blob" })
            .then(function (res) {
              if (attrs.authSrc !== url) return; // a newer URL replaced this one
              objectUrl = URL.createObjectURL(res.data);
              element.attr("src", objectUrl);
            })
            .catch(function () {
              if (attrs.authSrcError) scope.$eval(attrs.authSrcError);
            });
        });

        scope.$on("$destroy", release);
      },
    };
  },
]);

// ============================================================
// Phone drawer: tap the dark area to close the sidebar, Esc closes it too.
// (The dark overlay is .dashboard::after, and a click on a pseudo-element
// reports the .dashboard element itself as its target.)
// ============================================================
(function () {
  function closeSidebar(dashboard) {
    var scope = angular.element(dashboard).scope();
    if (scope && scope.sidebarOpen) {
      scope.$apply(function () {
        scope.sidebarOpen = false;
      });
    }
  }

  document.addEventListener("click", function (e) {
    var el = e.target;
    if (el && el.classList && el.classList.contains("dashboard") && el.classList.contains("sidebar-open")) {
      closeSidebar(el);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var dashboard = document.querySelector(".dashboard.sidebar-open");
    if (dashboard) closeSidebar(dashboard);
  });
})();
