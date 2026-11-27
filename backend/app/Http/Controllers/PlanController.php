<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePlanRequest;
use App\Http\Requests\UpdatePlanRequest;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = $request->user()
            ->plans()
            ->orderByDesc('is_pinned')
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if ($request->filled('date')) {
            $query->whereDate('plan_date', $request->query('date'));
        }

        $plans = $query->get();

        return response()->json($plans->map(fn (Plan $p) => $this->format($p)));
    }

    public function store(StorePlanRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (! array_key_exists('is_pinned', $data)) {
            $data['is_pinned'] = false;
        }

        $plan = $request->user()->plans()->create($data);

        return response()->json($this->format($plan), 201);
    }

    public function show(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlan($request, $plan);

        return response()->json($this->format($plan));
    }

    public function update(UpdatePlanRequest $request, Plan $plan): JsonResponse
    {
        $this->authorizePlan($request, $plan);

        $plan->update($request->validated());
        $plan->refresh();

        return response()->json($this->format($plan));
    }

    public function destroy(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlan($request, $plan);

        $plan->delete();

        return response()->json(null, 204);
    }

    private function authorizePlan(Request $request, Plan $plan): void
    {
        abort_if($plan->user_id !== $request->user()->id, 403);
    }

    private function format(Plan $plan): array
    {
        return [
            'id'         => $plan->id,
            'user_id'    => $plan->user_id,
            'title'      => $plan->title,
            'content'    => $plan->content,
            'plan_date'  => $plan->plan_date?->toDateString(),
            'is_pinned'  => (bool) $plan->is_pinned,
            'created_at' => $plan->created_at?->toISOString(),
            'updated_at' => $plan->updated_at?->toISOString(),
        ];
    }
}
