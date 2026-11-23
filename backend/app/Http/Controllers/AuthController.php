<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\UpdateMeRequest;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create([
            'name'     => $request->name,
            'email'    => $request->email,
            'password' => $request->password,
            'timezone' => $request->timezone,
        ]);

        return response()->json([
            'token' => $user->createToken('api')->plainTextToken,
            'user'  => $user,
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        return response()->json([
            'token' => $user->createToken('api')->plainTextToken,
            'user'  => $user,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    public function updateMe(UpdateMeRequest $request): JsonResponse
    {
        $user = $request->user();

        if ($request->has('timezone')) {
            $hasActiveTrack = Track::where('user_id', $user->id)
                ->with('user')
                ->get()
                ->contains(fn (Track $t) => $t->status === 'active');

            if ($hasActiveTrack) {
                return response()->json([
                    'message' => 'Timezone cannot be changed while you have an active track.',
                    'code'    => 'timezone_locked',
                ], 409);
            }
        }

        $data = $request->only(array_filter(['name', 'email', 'timezone'], fn ($k) => $request->has($k)));
        $user->update($data);

        return response()->json($user->fresh());
    }
}
