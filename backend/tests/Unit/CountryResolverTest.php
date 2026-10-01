<?php

namespace Tests\Unit;

use App\Services\Analytics\CountryResolver;
use GeoIp2\Database\Reader;
use GeoIp2\Model\City;
use Tests\TestCase;

/**
 * 2026-10-01: production installs GeoLite2-City, but this class asked for `country()`, which the library
 * refuses on a City database. The exception was swallowed as "unknown", so every request got a 451.
 */
class CountryResolverTest extends TestCase
{
    private string $db;

    protected function setUp(): void
    {
        parent::setUp();
        $this->db = tempnam(sys_get_temp_dir(), 'geo');
        config(['services.maxmind.database_path' => $this->db]);
    }

    protected function tearDown(): void
    {
        @unlink($this->db);
        parent::tearDown();
    }

    /** A resolver whose reader behaves like the library on a GeoLite2-City file. */
    private function cityDatabase(?string $iso): CountryResolver
    {
        $reader = new class($iso) extends Reader {
            public function __construct(private ?string $iso) {}

            public function city(string $ipAddress): City
            {
                return new City(['country' => $this->iso ? ['iso_code' => $this->iso] : []]);
            }

            public function country(string $ipAddress): \GeoIp2\Model\Country
            {
                throw new \BadMethodCallException('The country method cannot be used to open a GeoLite2-City database');
            }
        };

        return new class($reader) extends CountryResolver {
            public function __construct(private Reader $stub) {}

            protected function open(string $path): Reader
            {
                return $this->stub;
            }
        };
    }

    public function test_a_city_database_places_a_public_address_in_its_country(): void
    {
        $this->assertSame('GB', $this->cityDatabase('GB')->forIp('2a00:23c7:9a90:fc01:7410:fff4:68c7:52e9'));
        $this->assertSame('GB', $this->cityDatabase('gb')->forIp('86.158.1.1'));
    }

    public function test_an_address_without_a_country_is_unknown_not_an_error(): void
    {
        $this->assertNull($this->cityDatabase(null)->forIp('8.8.8.8'));
    }

    public function test_private_and_missing_addresses_are_never_looked_up(): void
    {
        $resolver = $this->cityDatabase('GB');
        $this->assertNull($resolver->forIp('10.0.0.5'));
        $this->assertNull($resolver->forIp('127.0.0.1'));
        $this->assertNull($resolver->forIp(null));
    }

    public function test_no_database_file_means_unknown(): void
    {
        config(['services.maxmind.database_path' => '/nonexistent/GeoLite2-City.mmdb']);
        $this->assertNull($this->cityDatabase('GB')->forIp('8.8.8.8'));
    }
}
