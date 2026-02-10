export interface Complaint {
  id: string
  text: string
  location_label: string | null
  category_pred: string | null
  severity_pred: number | null
  urgency_pred: string | null
  confidence: number | null
  status: string | null
  created_at: string
  cluster_id: string | null
  telegram_user_id: string | null
  telegram_username: string | null
  photo_url: string | null
}

export interface Evidence {
  id: string
  task_id: string
  before_image_url: string | null
  after_image_url: string | null
  submitted_at: string
  notes: string | null
  submitted_by: string | null
}
