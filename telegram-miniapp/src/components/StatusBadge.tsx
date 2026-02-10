const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  RECEIVED: { bg: '#e3f2fd', color: '#1565c0' },
  LINKED: { bg: '#e3f2fd', color: '#1565c0' },
  CLUSTERED: { bg: '#e8f5e9', color: '#2e7d32' },
  TRIAGED: { bg: '#fff3e0', color: '#e65100' },
  REVIEWED: { bg: '#fff3e0', color: '#e65100' },
  PLANNED: { bg: '#e8f5e9', color: '#2e7d32' },
  DISPATCHED: { bg: '#e8f5e9', color: '#2e7d32' },
  IN_PROGRESS: { bg: '#fff3e0', color: '#e65100' },
  VERIFIED: { bg: '#e8f5e9', color: '#1b5e20' },
  CLOSED: { bg: '#f5f5f5', color: '#616161' },
}

export default function StatusBadge({ status }: { status: string }) {
  const trimmed = status.trim()
  const style = STATUS_STYLES[trimmed] || { bg: '#f5f5f5', color: '#616161' }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.3px',
        backgroundColor: style.bg,
        color: style.color,
        textTransform: 'uppercase',
      }}
    >
      {trimmed}
    </span>
  )
}
