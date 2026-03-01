import { useState, useEffect } from 'react'
import { PageHeader } from './ui/PageHeader'
import { Card } from './ui/Card'
import { Bot, Search, Terminal, FileCode2, Play, Plus, Map, Trash2, Save, Sparkles } from 'lucide-react'
import { apiClient } from '../api/client'
import type { AgentDefinition } from '../api/client'
import { useToast } from './ui/Toast'

export function AgentWorkflows() {
    const [agents, setAgents] = useState<AgentDefinition[]>([])
    const [activeAgent, setActiveAgent] = useState<AgentDefinition | null>(null)
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [agentInput, setAgentInput] = useState("")
    const { toast } = useToast()

    useEffect(() => {
        fetchAgents()
    }, [])

    const fetchAgents = async () => {
        try {
            setLoading(true)
            const data = await apiClient.agents.getAgents()
            setAgents(data)
        } catch {
            // fetch failed silently
        } finally {
            setLoading(false)
        }
    }

    const handleSaveAgent = async () => {
        if (!activeAgent) return
        try {
            const saved = await apiClient.agents.saveAgent(activeAgent)
            setActiveAgent(saved)
            fetchAgents()
            toast('Workflow saved successfully!', 'success')
        } catch (e) {
            toast('Failed to save workflow', 'error')
        }
    }

    const handleDeleteAgent = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this workflow?")) return
        try {
            await apiClient.agents.deleteAgent(id)
            if (activeAgent?.id === id) setActiveAgent(null)
            fetchAgents()
        } catch (e) {
            toast('Failed to delete workflow', 'error')
        }
    }

    const handleExecuteAgent = async () => {
        if (!activeAgent || !activeAgent.id) return
        try {
            setExecuting(true)
            const result = await apiClient.agents.execute(activeAgent.id, agentInput || "Test Input")
            toast(`Execution successful! Completed ${result.steps?.length || 0} nodes in ${result.execution_time?.toFixed(2)}s`, 'success')
        } catch (e) {
            toast('Execution failed', 'error')
        } finally {
            setExecuting(false)
        }
    }

    const filteredAgents = agents.filter(a =>
        a.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="h-full flex flex-col text-white overflow-hidden pb-4">
            <PageHeader>
                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search workflows..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-blue-500/50 w-64 transition-all"
                        />
                    </div>
                    <button
                        onClick={() => setActiveAgent({ name: "New Agent Workflow", nodes: [], edges: [], config: {} })}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Agent
                    </button>
                    {activeAgent && (
                        <button
                            onClick={handleSaveAgent}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            Save
                        </button>
                    )}
                </div>
            </PageHeader>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Workflows List Sidebar */}
                <div className="w-80 flex flex-col gap-4 overflow-hidden">
                    <Card className="flex-1 flex flex-col overflow-hidden bg-black/20 border-white/5">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Saved Pipelines</h3>
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">{agents.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {filteredAgents.map((agent) => (
                                <div
                                    key={agent.id}
                                    onClick={() => setActiveAgent(agent)}
                                    className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${activeAgent?.id === agent.id
                                        ? 'bg-blue-500/10 border-blue-500/40'
                                        : 'bg-[#18181B] border-white/5 hover:border-white/20 hover:bg-white/[0.02]'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeAgent?.id === agent.id ? 'bg-blue-500 text-white' : 'bg-black/40 text-gray-500'}`}>
                                            <Bot className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-gray-200 truncate">{agent.name}</div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5 uppercase tracking-wide font-bold">
                                                <span className="flex items-center gap-1"><Map className="w-3 h-3" /> {agent.nodes?.length || 0} Nodes</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (agent.id) handleDeleteAgent(agent.id); }}
                                        className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {agents.length === 0 && !loading && (
                                <div className="p-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                                    <p className="text-gray-500 text-sm">No agent workflows found.</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Tools Palette */}
                    <Card className="p-4 bg-black/40 border-white/5">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-4">Build Palette</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <ToolItem icon={<Search className="w-4 h-4 text-blue-400" />} label="Search" />
                            <ToolItem icon={<Terminal className="w-4 h-4 text-green-400" />} label="Bash" />
                            <ToolItem icon={<FileCode2 className="w-4 h-4 text-yellow-400" />} label="Python" />
                            <ToolItem icon={<Bot className="w-4 h-4 text-blue-400" />} label="LLM" />
                        </div>
                    </Card>
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDIwaDQwTTIwIDB2NDAiIHN0cm9rZT0icmdiYSsyNTUsIDI1NSwgMjU1LCAwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIi8+Cjwvc3ZnPg==')] bg-black/40 border border-white/10 rounded-xl relative overflow-hidden flex items-center justify-center group">

                    {activeAgent ? (
                        <div className="absolute inset-0 p-8">
                            {/* Simplified Visual Representation of Workflow Node */}
                            <div className="inline-block bg-[#18181B] border border-white/10 p-1.5 rounded-2xl">
                                <div className="bg-gradient-to-br from-[#27272A] to-[#18181B] rounded-xl p-6 border border-white/5 w-80">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                            <Sparkles className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <input
                                                value={activeAgent.name}
                                                onChange={(e) => setActiveAgent({ ...activeAgent, name: e.target.value })}
                                                className="bg-transparent text-lg font-bold text-white outline-none border-b border-transparent focus:border-blue-500/50 transition-colors w-full"
                                            />
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Workflow Entry Point</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-3 bg-black/40 rounded-lg border border-white/5">
                                            <p className="text-[11px] text-gray-500 mb-2 font-bold uppercase tracking-wide">System Intelligence</p>
                                            <div className="flex items-center justify-between text-xs text-gray-300">
                                                <span>Reasoning Level</span>
                                                <span className="text-blue-400">Advanced</span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-black/40 rounded-lg border border-white/5">
                                            <p className="text-[11px] text-gray-500 mb-2 font-bold uppercase tracking-wide">Memory Window</p>
                                            <div className="flex items-center justify-between text-xs text-gray-300">
                                                <span>Context Tokens</span>
                                                <span className="text-green-400">32,768</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Canvas Action HUD */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#18181B]/90 backdrop-blur-md border border-white/10 px-6 py-3 rounded-full flex items-center gap-4">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Pipeline Status: <span className={executing ? "text-blue-400" : "text-amber-500"}>{executing ? "Running..." : "Ready"}</span></span>
                                <div className="h-4 w-px bg-white/20" />
                                <input
                                    type="text"
                                    placeholder="Enter input..."
                                    value={agentInput}
                                    onChange={(e) => setAgentInput(e.target.value)}
                                    disabled={executing}
                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1 text-xs text-white outline-none focus:border-blue-500/50 w-48 disabled:opacity-50"
                                />
                                <div className="h-4 w-px bg-white/20" />
                                <button
                                    onClick={handleExecuteAgent}
                                    disabled={executing || !activeAgent.id}
                                    className="flex items-center gap-2 text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors text-sm font-bold"
                                >
                                    {executing ? (
                                        <div className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4 fill-current" />
                                    )}
                                    {executing ? "Processing..." : "Run Sequence"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center space-y-4 opacity-40 group-hover:opacity-60 transition-opacity">
                            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto border border-white/10">
                                <Map className="w-10 h-10 text-gray-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-300">No Active Workflow</h3>
                                <p className="text-sm text-gray-500">Select or create a pipeline to begin visual construction.</p>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}

function ToolItem({ icon, label }: { icon: any, label: string }) {
    return (
        <div className="p-2.5 bg-[#18181B] border border-white/5 rounded-xl hover:bg-white/[0.05] cursor-grab active:cursor-grabbing flex items-center gap-3 transition-colors">
            <div className="p-1.5 rounded-lg bg-black/40">
                {icon}
            </div>
            <span className="text-[11px] font-bold text-gray-300">{label}</span>
        </div>
    )
}
