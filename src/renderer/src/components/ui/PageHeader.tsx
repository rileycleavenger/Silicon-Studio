import React from 'react';

export function PageHeader({
    children,
}: {
    title?: string;
    description?: string;
    children?: React.ReactNode;
    badge?: string;
}) {
    if (!children) return null;
    return (
        <div className="flex items-center justify-center gap-3 mb-3 shrink-0">
            {children}
        </div>
    );
}
