#!/bin/sh
set -e
php artisan package:discover --ansi
php artisan migrate --force
php artisan config:cache
php artisan event:cache
exec apache2-foreground
