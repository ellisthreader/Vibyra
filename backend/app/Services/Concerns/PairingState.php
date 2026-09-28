<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait PairingState
{
    public function state(): array
    {
        return $this->read();
    }

    public function publicState(): array
    {
        $state = $this->read();

        return [
            'machineName' => $state['machineName'],
            'pairCode' => $state['pairCode'],
            'pairedDevice' => $state['pairedDevice'],
            'pendingPair' => $state['pendingPair'],
            'latestPreview' => $state['latestPreview'],
            'events' => $state['events'],
            'connectionUrls' => $this->connectionUrls(),
            'projects' => $state['projects'],
        ];
    }

    public function health(): array
    {
        $state = $this->read();

        return [
            'ok' => true,
            'machineName' => $state['machineName'],
            'pairCode' => $state['pairCode'],
            'paired' => filled($state['pairedDevice']),
            'pairedDevice' => $state['pairedDevice'],
            'startedAt' => $state['startedAt'],
            'preview' => $state['latestPreview'],
            'connectionUrls' => $this->connectionUrls(),
        ];
    }

    public function requestPair(string $code, string $deviceName): array
    {
        $state = $this->read();

        if (Str::upper(trim($code)) !== $state['pairCode']) {
            abort(response()->json(['ok' => false, 'error' => 'Pair code does not match'], 401));
        }

        $state['pendingPair'] = [
            'id' => 'pair-'.now()->timestamp.'-'.random_int(100, 999),
            'deviceName' => $deviceName ?: 'Vibyra Phone',
            'requestedAt' => now()->toISOString(),
            'status' => 'pending',
        ];
        $state['events'] = $this->pushEvent(
            $state['events'],
            'Pairing',
            $state['pendingPair']['deviceName'].' is asking to pair',
            'warning'
        );
        $this->write($state);

        return [
            'ok' => true,
            'status' => 'pending',
            'requestId' => $state['pendingPair']['id'],
            'machineName' => $state['machineName'],
        ];
    }

    public function approvePair(): array
    {
        $state = $this->read();

        if ($state['pendingPair']) {
            $state['pairedDevice'] = $state['pendingPair']['deviceName'];
            $state['pendingPair']['status'] = 'approved';
            $state['projects'] = $this->discoverProjects();
            $state['events'] = $this->pushEvent(
                $state['events'],
                'Pairing',
                $state['pairedDevice'].' approved in Vibyra Desktop',
                'success'
            );
            $this->write($state);
        }

        return $this->publicState();
    }

    public function denyPair(): array
    {
        $state = $this->read();

        if ($state['pendingPair']) {
            $state['pendingPair']['status'] = 'denied';
            $state['events'] = $this->pushEvent($state['events'], 'Pairing', 'Pairing request denied', 'error');
            $this->write($state);
        }

        return $this->publicState();
    }

    public function pairStatus(string $requestId): array
    {
        $state = $this->read();
        $pending = $state['pendingPair'];

        if (! $pending || $pending['id'] !== $requestId) {
            abort(response()->json(['ok' => false, 'error' => 'Pair request not found'], 404));
        }

        if ($pending['status'] === 'denied') {
            abort(response()->json(['ok' => false, 'status' => 'denied', 'error' => 'Desktop denied pairing'], 403));
        }

        if ($pending['status'] === 'approved') {
            $state['projects'] = $this->discoverProjects();
            $this->write($state);

            return [
                'ok' => true,
                'status' => 'approved',
                'token' => $state['token'],
                'machineName' => $state['machineName'],
                'projects' => $state['projects'],
                'events' => $state['events'],
            ];
        }

        return ['ok' => true, 'status' => 'pending', 'machineName' => $state['machineName']];
    }

    public function tokenIsValid(?string $authorization): bool
    {
        $state = $this->read();

        return $authorization === 'Bearer '.$state['token'];
    }
}
