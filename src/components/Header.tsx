import type { ContributorInfo } from '../types'

interface Props {
  contributor: ContributorInfo
  onEdit: () => void
}

export default function Header({ contributor, onEdit }: Props) {
  return (
    <header className="app-header">
      <h1>Landcover Truthing</h1>
      <div className="app-header-identity">
        <span>{contributor.name}</span>
        <button type="button" className="linklike" onClick={onEdit}>
          edit my info
        </button>
      </div>
    </header>
  )
}
