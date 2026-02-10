import ComplaintDetailPage from '@/components/pages/ComplaintDetailPage'

export default function Page({ params }: { params: { id: string } }) {
  return <ComplaintDetailPage id={params.id} />
}
