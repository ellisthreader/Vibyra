<?php
namespace Tests\Feature;
use App\Console\Commands\{CheckJev, ConfigureJev};
use Illuminate\Console\Application;
use Illuminate\Foundation\Console\ConfigClearCommand;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\{Cache, Http};
use Symfony\Component\Console\Tester\CommandTester;
use Symfony\Component\Process\Process;
use Tests\TestCase;
final class JevSetupAuditTest extends TestCase
{
    private string $sandbox;
    private string $originalBase;
    private string $originalEnvironment;
    protected function setUp(): void
    {
        parent::setUp();Http::preventStrayRequests();Cache::flush();
        $this->originalBase=$this->app->basePath();$this->originalEnvironment=$this->app['env'];
        $this->sandbox=sys_get_temp_dir().'/jev-setup-audit-'.bin2hex(random_bytes(8));
        mkdir($this->sandbox,0700);mkdir($this->sandbox.'/bootstrap/cache',0700,true);
        (new Process(['git','init','--quiet',$this->sandbox]))->mustRun();
        file_put_contents($this->sandbox.'/.gitignore',".env\n.jev-secret-*\n");
        file_put_contents($this->sandbox.'/.env',"UNRELATED_SETTING=preserved\nJEV_API_KEY=synthetic-old\nJEV_DECISIONS_MODE=active\n");
        $this->app->setBasePath($this->sandbox);
    }
    protected function tearDown(): void
    {
        $this->app->setBasePath($this->originalBase);$this->app['env']=$this->originalEnvironment;
        (new Filesystem)->deleteDirectory($this->sandbox);parent::tearDown();
    }
    private function command(string $class, array $inputs=[]): CommandTester
    {
        $console=new Application($this->app,$this->app['events'],'audit');
        $console->add(new ConfigClearCommand(new Filesystem));$console->add($this->app->make($class));
        $name=$class===ConfigureJev::class?'vibyra:configure-jev':'vibyra:check-jev';
        $tester=new CommandTester($console->find($name));$tester->setInputs($inputs);
        $tester->execute([],['interactive'=>true]);return $tester;
    }
    public function test_hidden_setup_atomically_saves_owner_only_and_keeps_mode_off(): void
    {
        $key='sk-or-v1-'.str_repeat('f',48);
        $result=$this->command(ConfigureJev::class,[$key]);
        $this->assertSame(0,$result->getStatusCode(),$result->getDisplay());
        $text=file_get_contents($this->sandbox.'/.env');
        $this->assertStringContainsString('JEV_API_KEY='.$key,$text);
        $this->assertStringContainsString('JEV_DECISIONS_MODE=off',$text);
        $this->assertStringContainsString('UNRELATED_SETTING=preserved',$text);
        $this->assertStringNotContainsString('synthetic-old',$text);
        $this->assertSame(1,substr_count($text,'JEV_API_KEY='));
        clearstatcache();$this->assertSame(0600,fileperms($this->sandbox.'/.env')&0777);
        $this->assertStringNotContainsString($key,$result->getDisplay());
        $this->assertSame([],glob($this->sandbox.'/.jev-secret-*'));Http::assertNothingSent();
    }
    public function test_symlink_is_rejected_without_touching_target(): void
    {
        rename($this->sandbox.'/.env',$this->sandbox.'/fixture-target');
        symlink($this->sandbox.'/fixture-target',$this->sandbox.'/.env');
        $before=file_get_contents($this->sandbox.'/fixture-target');
        $result=$this->command(ConfigureJev::class);
        $this->assertSame(1,$result->getStatusCode());
        $this->assertSame($before,file_get_contents($this->sandbox.'/fixture-target'));
    }
    public function test_unignored_or_tracked_environment_is_rejected(): void
    {
        file_put_contents($this->sandbox.'/.gitignore',".jev-secret-*\n");
        $before=file_get_contents($this->sandbox.'/.env');
        $this->assertSame(1,$this->command(ConfigureJev::class)->getStatusCode());
        file_put_contents($this->sandbox.'/.gitignore',".env\n.jev-secret-*\n");
        (new Process(['git','add','-f','.env'],$this->sandbox))->mustRun();
        $this->assertSame(1,$this->command(ConfigureJev::class)->getStatusCode());
        $this->assertSame($before,file_get_contents($this->sandbox.'/.env'));
    }
    public function test_production_setup_is_rejected_and_invalid_input_never_echoes(): void
    {
        $this->app['env']='production';
        $this->assertSame(1,$this->command(ConfigureJev::class)->getStatusCode());
        $this->app['env']='testing';$input='synthetic-secret-invalid-format';
        $result=$this->command(ConfigureJev::class,[$input]);
        $this->assertSame(1,$result->getStatusCode());
        $this->assertStringNotContainsString($input,$result->getDisplay());
        $this->assertStringContainsString('JEV_DECISIONS_MODE=active',file_get_contents($this->sandbox.'/.env'));
    }
    public function test_check_only_reads_mock_metadata_and_sanitizes_provider_failures(): void
    {
        $key='sk-or-v1-'.str_repeat('e',48);config(['intelligence.jev_key'=>$key,'services.openrouter.key'=>'other-fixture']);
        $failed=false;
        Http::fake(['https://openrouter.ai/api/v1/key'=>function () use (&$failed,$key) {
            return $failed ? Http::response(['error'=>$key],500) : Http::response(['data'=>[
            'limit'=>5,'limit_remaining'=>5,'limit_reset'=>null,'include_byok_in_limit'=>true,
            'is_management_key'=>false,'is_provisioning_key'=>false]]);
        }]);
        $result=$this->command(CheckJev::class);$this->assertSame(0,$result->getStatusCode());
        Http::assertSentCount(1);Http::assertNotSent(fn($r)=>str_contains($r->url(),'/decisions'));
        Cache::flush();$failed=true;
        $result=$this->command(CheckJev::class);$this->assertSame(1,$result->getStatusCode());
        $this->assertStringNotContainsString($key,$result->getDisplay());
    }
}
