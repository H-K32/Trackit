import { client } from './client.ts'

export interface PlanItem {
  id: number
  user_id: number
  title: string
  content: string | null
  plan_date: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface CreatePlanPayload {
  title: string
  content?: string | null
  plan_date?: string | null
  is_pinned?: boolean
}

export interface UpdatePlanPayload {
  title?: string
  content?: string | null
  plan_date?: string | null
  is_pinned?: boolean
}

/**
 * GET /api/plans
 * Fetches all plans/notes for the authenticated user (optionally filtered by YYYY-MM-DD date).
 */
export async function getPlans(date?: string): Promise<PlanItem[]> {
  return client.get<PlanItem[]>('/plans', {
    params: date ? { date } : undefined,
  })
}

/**
 * POST /api/plans
 * Creates a new plan or note.
 */
export async function createPlan(payload: CreatePlanPayload): Promise<PlanItem> {
  return client.post<PlanItem>('/plans', payload)
}

/**
 * GET /api/plans/{plan}
 * Fetches a single plan/note.
 */
export async function getPlan(planId: number | string): Promise<PlanItem> {
  return client.get<PlanItem>(`/plans/${planId}`)
}

/**
 * PATCH /api/plans/{plan}
 * Updates a plan/note.
 */
export async function updatePlan(planId: number | string, payload: UpdatePlanPayload): Promise<PlanItem> {
  return client.patch<PlanItem>(`/plans/${planId}`, payload)
}

/**
 * DELETE /api/plans/{plan}
 * Deletes a plan/note.
 */
export async function deletePlan(planId: number | string): Promise<void> {
  return client.delete(`/plans/${planId}`)
}
