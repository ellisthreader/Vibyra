<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\NextTen\TestsBillingIapGrants;
use Tests\Feature\Concerns\NextTen\TestsBillingIapOwnership;
use Tests\Feature\Concerns\NextTen\TestsBillingIapTransactions;
use Tests\Feature\Concerns\NextTen\BillingIapReceiptTestSupport;
use Tests\TestCase;

class BillingIapReceiptTest extends TestCase
{
    use RefreshDatabase;
    use TestsBillingIapGrants,
        TestsBillingIapOwnership,
        TestsBillingIapTransactions,
        BillingIapReceiptTestSupport;
}
