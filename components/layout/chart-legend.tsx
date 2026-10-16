import type { ReactNode } from "react";

/** Recharts legend label in a neutral, AA-contrast text colour (the default is the series colour, e.g. pale yellow on white). */
export const legendFormatter = (value: ReactNode): ReactNode => <span className="text-slate-700 dark:text-slate-200">{value}</span>;
