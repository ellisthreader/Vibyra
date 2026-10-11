<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An organization's OIDC settings. The client secret is encrypted at rest and never serialized. */
final class OrganizationSso extends Model
{
    protected $table = 'organization_sso';
    protected $primaryKey = 'organization_id';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = ['*'];
    protected $hidden = ['client_secret', 'domain_token'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'require_sso' => 'boolean', 'domain_verified_at' => 'datetime'];
    }
}
