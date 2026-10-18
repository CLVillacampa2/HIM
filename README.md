<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).

## Barangay Health Center EHR

This repository includes a Laravel JSON API and a React/Vite PWA shell for a barangay health center. The API is rooted at `/api/v1`; the browser writes patient, household, immunization, and encounter changes to IndexedDB before queuing them for synchronization.

### Local setup (PowerShell)

1. Install PHP 8.2+, Composer, Node.js 20.19+ (or 22.12+), and MySQL 8 or MariaDB. Create an empty database and configure `.env` with its host, database name, username, and password. Set `APP_TIMEZONE=Asia/Manila`, `FRONTEND_URL=http://localhost:5173`, and `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1`.

	On Windows/XAMPP, Composer also needs PHP's ZIP extension. Run `php --ini` to locate the active PHP configuration, enable `extension=zip`, save it, and open a new terminal. Confirm `php -m` lists `zip` before installing Composer packages.

2. From the repository root, run:

```powershell
Copy-Item .env.example .env
composer update laravel/sanctum --with-dependencies
npm install
php artisan key:generate
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate --seed
npm run build
```

Edit `.env` before running the migrations if MySQL/MariaDB is being used. Do not commit `.env`, access tokens, or patient data.

3. Create named health-worker accounts; the seeders intentionally do not create a default login:

```powershell
php artisan tinker
```

At the Tinker prompt, create an account with a unique work email and a strong password using `App\Models\User::create(['name' => 'Health Worker', 'email' => 'worker@example.org', 'password' => Illuminate\Support\Facades\Hash::make('replace-with-a-secret')]);`, then exit Tinker.

4. Run the API and Vite development server in separate terminals:

```powershell
php artisan serve --host=0.0.0.0
```

```powershell
npm run dev -- --host=0.0.0.0
```

Open the Laravel URL (`http://127.0.0.1:8000`). For a tablet on the local network, use the development machine's LAN IP in `VITE_API_BASE_URL` and `FRONTEND_URL`, allow the ports through the local firewall, and restart Vite. Service workers require HTTPS except on localhost; use HTTPS for a deployed or LAN-accessible installation.

### Seed and API notes

- `VaccineScheduleSeeder` seeds 15 routine BCG, HepB, Pentavalent, OPV, IPV, PCV, and MMR dose rows. It uses exact week offsets and calendar-month due dates; the 30-day due window and catch-up interval policy are implementation defaults and must be checked against the current DOH/NIP circular.
- `Icd10CodeSeeder` supplies 50 starter diagnosis entries, not a complete official ICD-10 release. Verify codes, descriptions, licensing, and the applicable Philippine reporting release before clinical use.
- `GET /api/v1/patients/{patient}/immunizations/reminder-payload` only prepares SMS content. No SMS provider is configured. The FHSIS diagnosis endpoint is an aggregation starter, not a certified DOH export.
- Sync is per-transaction and idempotent. On stale patient/household updates, the server timestamp wins and the authoritative snapshot is returned to replace the local copy. Validation failures and conflicts remain visible in the local sync queue.

### Health-data deployment checklist

This starter is not a substitute for clinical, privacy, or security validation. IndexedDB records and the persisted bearer token are not encrypted by this app. Before real patient data is used, deploy only on managed devices with full-disk encryption, device lock/remote wipe, HTTPS, restricted network access, role-based authorization, audit/retention policies, backups, incident response, and an approved privacy impact assessment. Add a vetted local encryption/key-management design and SMS consent/provider workflow before production. Do not use real PHI during development or demo testing.
