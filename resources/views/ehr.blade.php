<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0f766e">
    <meta name="description" content="Offline-first electronic health records and immunization tracking for authorized Barangay Health Center staff.">
    <link rel="manifest" href="{{ asset('build/manifest.webmanifest') }}">
    <title>Barangay Health Center EHR</title>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <div id="app"></div>
</body>
</html>
