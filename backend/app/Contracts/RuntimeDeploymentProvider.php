<?php

namespace App\Contracts;

use App\Models\PublishedProjectDeployment;

interface RuntimeDeploymentProvider
{
    public function deploy(PublishedProjectDeployment $deployment): PublishedProjectDeployment;
}
