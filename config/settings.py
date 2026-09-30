from pathlib import Path
import os
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _

# Load .env
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------
# ENVIRONMENT MODE
# ---------------------------------
ENV = os.getenv("ENV", "PROD").upper()  # DEV or PROD - defaults to PROD (safe/locked-down) if unset
IS_DEV = ENV == "DEV"

print("Running Django in:", ENV, "(DEV mode)" if IS_DEV else "(PROD mode)")


def require_env(name):
    """Fetch a required env var, or refuse to start the app if it's missing."""
    value = os.getenv(name)
    if not value:
        raise ImproperlyConfigured(
            f"Environment variable '{name}' is required when ENV=PROD but was not set."
        )
    return value


# ---------------------------------
# SECRET / DEBUG
# ---------------------------------
if IS_DEV:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
else:
    # In production, require SECRET_KEY to be set in environment variables
    SECRET_KEY = require_env("SECRET_KEY")
DEBUG = IS_DEV


# ---------------------------------
# CLIENT (frontend origin, e.g. for post-login redirects)
# ---------------------------------
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")


# ---------------------------------
# HOSTS
# ---------------------------------
if IS_DEV:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", os.getenv("CURRENT_HOST", "172.30.10.5")]
else:
    from urllib.parse import urlparse
    _hosts = [h.strip() for h in require_env("DJANGO_ALLOWED_HOSTS").split(",") if h.strip()]
    for _local in ("localhost", "127.0.0.1"):
        if _local not in _hosts:
            _hosts.append(_local)
    _client_h = urlparse(CLIENT_URL).netloc.split(":")[0] if "://" in CLIENT_URL else CLIENT_URL.split(":")[0]
    if _client_h and _client_h not in _hosts:
        _hosts.append(_client_h)
    ALLOWED_HOSTS = _hosts


# ---------------------------------
# INSTALLED APPS
# ---------------------------------
INSTALLED_APPS = [
    "daphne",
    # default apps
    "unfold",
    "unfold.contrib.forms",
    "unfold.contrib.import_export",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "tailwind",
    "import_export",
    "django_cotton",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    # Project apps
    "base",
    # Domain apps (audit §2.3). New work goes in one of these; never in an app
    # named after a job title.
    "institution",
    "training",
    "placements",
    "student",
    "department_coordinator",
    "placement_officer",
    "training_officer",
    "notifications",
    "program_coordinator_api",
    "internship_api",
    "faculty_coordinator",
    "staff",
    # Owns no models — management commands only. Bulk import of the historical
    # batch spreadsheets (rosters + placement registers) and the synthetic
    # training/internship seeder.
    "dataimport",
]

# ---------------------------------
# MIDDLEWARE
# ---------------------------------
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # For frontend dev mode
    "django.middleware.security.SecurityMiddleware",
    # Serves collected static files (admin CSS/JS, DRF browsable API, unfold
    # theme) directly from Gunicorn - there's no Caddy/Nginx in front of the
    # api container anymore to read them off a shared volume.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "base.middleware.NoCacheMiddleware",
    "base.middleware.ContentSecurityPolicyMiddleware",
]


ROOT_URLCONF = "config.urls"


# ---------------------------------
# TEMPLATES  (React prod build will go inside templates/)
# ---------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
            "libraries": {
                "staticfiles": "django.templatetags.static",
            },
            "loaders": [
                (
                    "django.template.loaders.cached.Loader",
                    [
                        "django_cotton.cotton_loader.Loader",
                        "django.template.loaders.filesystem.Loader",
                        "django.template.loaders.app_directories.Loader",
                    ],
                )
            ],
            "builtins": ["django_cotton.templatetags.cotton"],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

REDIS_HOST = os.getenv("REDIS_HOST", "redis" if not IS_DEV else "localhost")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") if IS_DEV else require_env("REDIS_PASSWORD")
REDIS_AUTH = f":{REDIS_PASSWORD}@" if REDIS_PASSWORD else ""

USE_REDIS = False
if IS_DEV:
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        s.connect((REDIS_HOST, 6379))
        s.close()
        USE_REDIS = True
    except Exception:
        USE_REDIS = False
else:
    USE_REDIS = True

if USE_REDIS:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [f"redis://{REDIS_AUTH}{REDIS_HOST}:6379/2"],
            },
        },
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": f"redis://{REDIS_AUTH}{REDIS_HOST}:6379/1",
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

# ---------------------------------
# DATABASE
# ---------------------------------
# Production is always MySQL. Dev defaults to SQLite for a zero-dependency
# checkout, but DATABASE_ENGINE=mysql switches dev onto the same engine as
# production - see docker-compose.dev.yml (T-05). SQLite and MySQL differ in
# constraint enforcement, collation and string casing, so any migration or
# schema change must be verified on MySQL: a green run on SQLite is not
# evidence that production will accept it.
DATABASE_ENGINE = os.getenv("DATABASE_ENGINE", "sqlite" if IS_DEV else "mysql").lower()

if DATABASE_ENGINE == "sqlite":
    if not IS_DEV:
        raise ImproperlyConfigured("DATABASE_ENGINE=sqlite is not permitted when ENV=PROD.")
    db_dir = BASE_DIR / "data"
    try:
        os.makedirs(db_dir, exist_ok=True)
    except Exception:
        import tempfile
        db_dir = Path(tempfile.gettempdir())
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": db_dir / "db.sqlite3",
            "OPTIONS": {
                "timeout": 20,
            },
        }
    }
else:
    _db_options = {}
    # Dev MySQL runs on the internal Docker network with no TLS; production
    # talks to the TCET-managed instance and must require it.
    _ssl_mode = os.getenv("DATABASE_SSL_MODE", "DISABLED" if IS_DEV else "REQUIRED")
    if _ssl_mode.upper() != "DISABLED":
        _db_options["ssl"] = {"ssl-mode": _ssl_mode}

    def _db_env(name, dev_default):
        return os.getenv(name, dev_default) if IS_DEV else require_env(name)

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": _db_env("DATABASE_NAME", "tnp"),
            "USER": _db_env("DATABASE_USER", "tnp"),
            "PASSWORD": _db_env("DATABASE_PASSWORD", "tnp"),
            "HOST": os.getenv("DATABASE_HOST", "mysql"),
            "PORT": os.getenv("DATABASE_PORT", "3306"),
            "OPTIONS": _db_options,
        }
    }


# ---------------------------------
# REST FRAMEWORK
# ---------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "base.error_utils.drf_exception_handler",
    # T-15. Only two apps paginated, so every other list endpoint returned the
    # entire table - 1,400 students today, 10,000 at target. Applying it
    # globally means a new list view is paginated by default rather than by
    # remembering to add it.
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    # T-22.
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}


# ---------------------------------
# API SCHEMA (T-22)
# ---------------------------------
# The schema at /api/schema/ is the source the typed TS client is generated
# from (client_app/src/lib/generated/). With generated types, the frontend
# cannot invent an endpoint or drift a field name away from its serializer -
# which the audit identified as the largest category of agent error in a split
# frontend/backend repo (§3, §9.4).
#
# Regenerate after changing any serializer:
#   python manage.py spectacular --file client_app/src/lib/generated/schema.yaml
#   cd client_app && npm run generate:api
SPECTACULAR_SETTINGS = {
    "TITLE": "TNP Portal API",
    "DESCRIPTION": (
        "Training & Placement portal. Authorisation rules are specified in "
        "docs/PERMISSIONS.md and enforced by base.permissions.HasRole."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Most endpoints here are function-based views returning JsonResponse, which
    # spectacular cannot introspect. Warnings are informative, not failures -
    # they mark the endpoints that still need an explicit @extend_schema, and
    # they shrink as views move into the domain apps (T-19..T-21).
    "SCHEMA_PATH_PREFIX": "/api",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": True,
}


# ---------------------------------
# RATE LIMITING
# ---------------------------------
# django-ratelimit's key="ip" reads REMOTE_ADDR. Behind Traefik + Cloudflare
# Tunnel every request arrives with the proxy's address, so an IP limit is a
# limit on the entire college at once - 5 logins per minute for ~1,400
# students. This was reproduced during the audit with ordinary curl testing.
#
# Only safe because Traefik is the sole ingress: docker-compose.yml publishes
# no ports, so nothing can reach the container directly and forge this header.
# Re-check this if that ever changes.
#
# Resolved through a callable rather than naming the META key directly:
# django-ratelimit raises on a request with no X-Forwarded-For (a 500 on the
# login form for anything not behind the proxy, which is every local
# `docker-compose.dev.yml` run) and cannot parse the multi-entry value a
# Cloudflare + Traefik chain produces. See base/ratelimit.py.
RATELIMIT_IP_META_KEY = "base.ratelimit.client_ip"


# ---------------------------------
# PASSWORD VALIDATION
# ---------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ---------------------------------
# INTERNATIONALIZATION
# ---------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True


STATIC_URL = "/static/"
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, "static"),
]
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    # Not the "Manifest" variant: that rewrites every CSS url() reference and
    # requires the referenced file to exist, which a pre-existing static
    # asset (static/css/style.css references a since-removed group.png)
    # fails. Compression without manifest/hashing matches how the old Caddy
    # setup served these files anyway (no cache-busting either way).
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"


if IS_DEV:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        # One-link Docker local setup (port 80 via nginx.local.conf)
        "http://localhost",
        "http://127.0.0.1",
    ]
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        # One-link Docker local setup
        "http://localhost",
        "http://127.0.0.1",
    ]
    SESSION_COOKIE_DOMAIN = None
    CSRF_COOKIE_DOMAIN = None
else:
    # The frontend (e.g. https://yourproject.example.com) and this API
    # (api.yourproject.example.com) are separate origins in production, so
    # both must be explicitly allowed - CORS_ALLOW_CREDENTIALS above only
    # takes effect for origins listed here.
    _frontend_url = require_env("CLIENT_URL")
    _allowed_hosts = require_env("DJANGO_ALLOWED_HOSTS").split(",")
    CORS_ALLOWED_ORIGINS = [_frontend_url]
    CSRF_TRUSTED_ORIGINS = [_frontend_url]
    for _host in _allowed_hosts:
        _h = _host.strip()
        if _h:
            _origin = _h if _h.startswith("http://") or _h.startswith("https://") else f"https://{_h}"
            if _origin not in CSRF_TRUSTED_ORIGINS:
                CSRF_TRUSTED_ORIGINS.append(_origin)
    # Cookies set by api.yourproject.example.com default to being scoped to
    # that host only, so frontend JS on yourproject.example.com couldn't read
    # the (non-HttpOnly) CSRF cookie or is_logged_in cookie. Scoping cookies
    # to the shared parent domain (e.g. ".yourproject.example.com") makes them
    # visible across both subdomains.
    def _extract_parent_domain(url_or_host):
        try:
            from urllib.parse import urlparse
            host = urlparse(url_or_host).netloc.split(":")[0] if "://" in url_or_host else url_or_host.split(":")[0]
            parts = host.split(".")
            if len(parts) >= 2 and not parts[-1].isdigit():
                return "." + ".".join(parts[-2:])
        except Exception:
            pass
        return None

    COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN") or _extract_parent_domain(_frontend_url)
    SESSION_COOKIE_DOMAIN = COOKIE_DOMAIN
    CSRF_COOKIE_DOMAIN = COOKIE_DOMAIN

CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]
CORS_ALLOW_CREDENTIALS = True


# ---------------------------------
# EMAIL
# ---------------------------------
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_USE_TLS = True
EMAIL_PORT = 587
EMAIL_HOST_USER = os.getenv("EMAIL_USERNAME") if IS_DEV else require_env("EMAIL_USERNAME")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_PASSWORD") if IS_DEV else require_env("EMAIL_PASSWORD")
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER


CELERY_BROKER_URL = f"redis://{REDIS_AUTH}{REDIS_HOST}:6379/0"
CELERY_RESULT_BACKEND = f"redis://{REDIS_AUTH}{REDIS_HOST}:6379/0"

CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "base.User"

UNFOLD = {
    "SITE_TITLE": "Admin site",
    "SITE_HEADER": "Thakur college of engineering and technology",
    "SITE_URL": CLIENT_URL,
    # TCET navy ramp, taken from tcetmumbai.in: #153f74 (its menu navy, and the
    # portal's own sidebar colour) sits at 700, with #0059b3 / #2c80d3 - the
    # college's mid and light blues - at 500 and 400. Unfold needs the full
    # 50-900 scale, not a single value: it picks different steps for hover,
    # focus, borders and dark mode.
    "COLORS": {
        "primary": {
            "50": "#eef4fb",
            "100": "#d6e4f5",
            "200": "#aecae9",
            "300": "#7dabdc",
            "400": "#2c80d3",
            "500": "#0059b3",
            "600": "#004080",
            "700": "#153f74",
            "800": "#0f2f57",
            "900": "#06213f",
        }
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": True,
        "show_home_link": True,
        "collapsible": False,
        "navigation": [
            {
                "title": _("Navigation"),
                "separator": True,
                "collapsible": True,
                "items": [
                    {
                        "title": _("Dashboard"),
                        "link": reverse_lazy("admin:index"),
                        "permission": lambda request: request.user.is_superuser,
                    },
                    {
                        "title": _("Users"),
                        "link": reverse_lazy("admin:base_user_changelist"),
                    },
                    {
                        "title": _("Student"),
                        "link": reverse_lazy("admin:student_student_changelist"),
                    },
                ],
            },
            {
                "title": _("Placement"),
                "separator": True,
                "collapsible": True,
                "items": [
                    {
                        "title": _("Placement (Import & Export)"),
                        "icon": "sync_alt",
                        "link": reverse_lazy("admin:placements_placement_import_export"),
                    },
                    {
                        "title": _("Companies"),
                        "icon": "business",
                        "link": reverse_lazy("admin:placements_company_changelist"),
                    },
                    {
                        "title": _("Placement Opportunities"),
                        "icon": "work",
                        "link": reverse_lazy("admin:placements_placementopportunity_changelist"),
                    },
                    {
                        "title": _("Import Sessions"),
                        "icon": "history",
                        "link": reverse_lazy("admin:placements_importsession_changelist"),
                    },
                ],
            },
        ],
    },
}

LOGIN_URL = "/auth/login/"

# Gunicorn only ever sees plain HTTP inside the Docker network - TLS is
# terminated at the edge in front of it (TCET hosting standard 11.3).
# SECURE_PROXY_SSL_HEADER tells Django to trust the proxy's
# X-Forwarded-Proto header when deciding whether the original request was
# HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Whether Django itself issues the HTTP->HTTPS redirect. Env-controlled
# because the correct value depends on the edge topology, not on the code:
#
#   * Cloudflare "Flexible" (edge terminates TLS and talks plain HTTP to the
#     origin): must be false. Traefik rewrites X-Forwarded-Proto to "http"
#     for the origin hop, so Django would judge every request insecure and
#     301 it to https:// - which the browser re-requests over HTTPS, arrives
#     as http again, and loops (ERR_TOO_MANY_REDIRECTS). The redirect is
#     redundant anyway: the edge already serves the browser over HTTPS, and
#     Cloudflare's "Always Use HTTPS" enforces it there.
#   * Cloudflare "Full"/"Full (strict)", or any origin that genuinely
#     receives HTTPS: true is correct and preferred.
#
# Defaults preserve the previous behaviour (off in dev, on in production) so
# an unset variable never silently downgrades a Full/strict deployment.
SECURE_SSL_REDIRECT = (
    os.getenv("SECURE_SSL_REDIRECT", "false" if IS_DEV else "true").lower() == "true"
)

# ---------------------------------
# SECURITY HEADERS
# ---------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
# HSTS. Note Django's SecurityMiddleware only emits this header when it
# considers the request secure, so under a Flexible-style edge (where the
# origin hop arrives as plain HTTP) it will not be sent. Enforce HSTS at the
# Cloudflare edge instead in that topology - the browser leg is the one that
# matters for HSTS.
SECURE_HSTS_SECONDS = 31536000 if not IS_DEV else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not IS_DEV
SECURE_HSTS_PRELOAD = not IS_DEV

# ---------------------------------
# COOKIE SECURITY
# ---------------------------------
SESSION_COOKIE_SECURE = not IS_DEV
CSRF_COOKIE_SECURE = not IS_DEV
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
