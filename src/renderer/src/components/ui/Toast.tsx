import { useState, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
    id: string
    message: string
    type: ToastType
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
    return useContext(ToastContext)
}

const ICONS: Record<ToastType, typeof Info> = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
}

const COLORS: Record<ToastType, string> = {
    success: 'border-green-500/30 text-green-400',
    error: 'border-red-500/30 text-red-400',
    warning: 'border-yellow-500/30 text-yellow-400',
    info: 'border-blue-500/30 text-blue-400',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID()
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }, [])

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
                {toasts.map(t => {
                    const Icon = ICONS[t.type]
                    return (
                        <div
                            key={t.id}
                            className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#1a1a1a] border ${COLORS[t.type]} text-sm shadow-lg animate-in slide-in-from-right`}
                        >
                            <Icon size={16} className="shrink-0 mt-0.5" />
                            <span className="flex-1 text-gray-200">{t.message}</span>
                            <button
                                onClick={() => dismiss(t.id)}
                                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
                                aria-label="Dismiss notification"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )
                })}
            </div>
        </ToastContext.Provider>
    )
}
