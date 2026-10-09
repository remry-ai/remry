import { projectStatusTone } from '$shared/utils/project-status';

// Badge class for a project status, in the same colour as its swimlane bar.
export const statusBadgeClass = (status: string | null | undefined): string =>
  status ? `badge ${projectStatusTone(status)}` : 'badge';
