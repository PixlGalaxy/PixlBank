// Best-effort default before React mounts and resolves the real theme (the
// server's default pre-login, or the signed-in user's own choice). A file
// rather than an inline <script> so the Content-Security-Policy can forbid
// inline scripts entirely.
document.documentElement.classList.add('dark');
