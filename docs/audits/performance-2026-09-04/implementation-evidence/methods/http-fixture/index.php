<?php
if ($_SERVER['REQUEST_URI']==='/slow') {header('Content-Type: text/event-stream');echo "data: first\n\n";ob_flush();flush();sleep(2);echo "data: done\n\n";}
else {header('Content-Type: application/json');echo json_encode(['ok'=>true,'method'=>$_SERVER['REQUEST_METHOD'],'authorization'=>$_SERVER['HTTP_AUTHORIZATION']??'']);}
