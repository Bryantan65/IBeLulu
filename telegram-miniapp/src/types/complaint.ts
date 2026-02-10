export interface Complaint {
  id: string
  text: string
  location_label: string | null
  category_pred: string | null
  severity_pred: number | null
  urgency_pred: string | null
  status: string | null
  created_at: string
  cluster_id: string | null
  telegram_user_id: string | null
  telegram_username: string | null
}
