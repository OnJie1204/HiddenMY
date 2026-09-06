<?php

/*
| API route composition
| Routes stay grouped by cohesive business feature while Laravel continues
| loading this file as the single API entry point.
*/

require __DIR__.'/api/system.php';
require __DIR__.'/api/auth.php';
require __DIR__.'/api/users.php';
require __DIR__.'/api/travel.php';
require __DIR__.'/api/hidden-gems.php';
