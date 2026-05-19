<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

trait AccountEndpoints
{
    public function updateAccountProfile(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $name = trim((string) $request->input('name', $user->name));
        $email = $this->normalizeEmail($request->input('email', $user->email));

        if ($name === '' || ! $email) {
            return $this->json(['ok' => false, 'error' => 'Enter a display name and valid email.'], 422);
        }

        if ($email !== $user->email && User::where('email', $email)->where('id', '!=', $user->id)->exists()) {
            return $this->json(['ok' => false, 'error' => 'That email is already in use.'], 409);
        }

        $this->moderation->assertLocalTextAllowed($name, 'account.name');
        $user->forceFill(['name' => $name, 'email' => $email])->save();

        return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh() ?? $user)]);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $password = (string) $request->input('password', '');

        if ($password === '' || ! Hash::check($password, $user->password)) {
            return $this->json(['ok' => false, 'error' => 'Password is incorrect.'], 401);
        }

        $user->delete();

        return $this->json(['ok' => true]);
    }
}
