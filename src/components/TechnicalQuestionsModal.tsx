import { useState } from "react";
import { CheckCircle, Code2, Plus, Trash2, X, Terminal, Cpu } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParsedDSAProblem, ParsedCodingTask, ParsedTechnicalMCQ, ParsedTechnicalResult } from "@/lib/pdfQuestionParser";

interface Props {
  open: boolean;
  technicalData: ParsedTechnicalResult;
  onClose: () => void;
  onConfirm: (data: ParsedTechnicalResult) => void;
  onReupload: () => void;
}

const inputCls =
  "w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary";

export default function TechnicalQuestionsModal({
  open,
  technicalData,
  onClose,
  onConfirm,
  onReupload,
}: Props) {
  const [dsaList, setDsaList] = useState<ParsedDSAProblem[]>(technicalData.dsa || []);
  const [codingList, setCodingList] = useState<ParsedCodingTask[]>(technicalData.coding || []);
  const [mcqList, setMcqList] = useState<ParsedTechnicalMCQ[]>(technicalData.mcq || []);
  const [activeTab, setActiveTab] = useState<"dsa" | "coding" | "mcq">("dsa");

  const totalCount = dsaList.length + codingList.length + mcqList.length;

  const handleSave = () => {
    onConfirm({
      dsa: dsaList,
      coding: codingList,
      mcq: mcqList,
    });
    onClose();
  };

  const addDsa = () => {
    setDsaList([
      ...dsaList,
      {
        problem_number: dsaList.length + 1,
        title: "New DSA Problem",
        description: "Problem description here...",
        difficulty: "medium",
        time_minutes: 25,
        expected_approach: "Optimal algorithm approach",
        test_cases: ["Sample input -> Sample output"],
        sample_input: "Input",
        sample_output: "Output",
      },
    ]);
  };

  const addCoding = () => {
    setCodingList([
      ...codingList,
      {
        task_number: codingList.length + 1,
        title: "New Architecture / Coding Task",
        description: "Task description and business requirements...",
        difficulty: "medium",
        time_minutes: 30,
        tech_stack: "TypeScript / Node.js",
        requirements: ["Requirement 1", "Requirement 2"],
      },
    ]);
  };

  const addMcq = () => {
    setMcqList([
      ...mcqList,
      {
        question_number: mcqList.length + 1,
        question: "New Technical Question?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_answer: "A",
        difficulty: "medium",
        topic: "General Technical",
      },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                <Code2 className="h-5 w-5 text-indigo-500" />
                Technical Round Questions
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {dsaList.length} DSA Problems • {codingList.length} Coding Tasks • {mcqList.length} MCQs ({totalCount} total)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onReupload} className="text-xs">
              Upload Different File
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 bg-secondary/50">
            <TabsTrigger value="dsa" className="gap-2">
              <Terminal className="h-4 w-4" /> DSA Problems ({dsaList.length})
            </TabsTrigger>
            <TabsTrigger value="coding" className="gap-2">
              <Cpu className="h-4 w-4" /> Coding Tasks ({codingList.length})
            </TabsTrigger>
            <TabsTrigger value="mcq" className="gap-2">
              <CheckCircle className="h-4 w-4" /> Technical MCQs ({mcqList.length})
            </TabsTrigger>
          </TabsList>

          {/* DSA Tab */}
          <TabsContent value="dsa" className="flex-1 overflow-y-auto space-y-4 py-3 pr-2">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Algorithmic & Data Structure Challenges with test cases.</p>
              <Button size="sm" variant="outline" onClick={addDsa} className="gap-1 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add DSA Problem
              </Button>
            </div>

            {dsaList.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500">
                    DSA #{p.problem_number}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={p.difficulty}
                      onValueChange={(v) => {
                        const copy = [...dsaList];
                        copy[idx].difficulty = v;
                        setDsaList(copy);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setDsaList(dsaList.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Title</label>
                  <Input
                    value={p.title}
                    onChange={(e) => {
                      const copy = [...dsaList];
                      copy[idx].title = e.target.value;
                      setDsaList(copy);
                    }}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Problem Statement</label>
                  <Textarea
                    value={p.description}
                    onChange={(e) => {
                      const copy = [...dsaList];
                      copy[idx].description = e.target.value;
                      setDsaList(copy);
                    }}
                    className="text-xs min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Expected Approach</label>
                    <Input
                      value={p.expected_approach || ""}
                      onChange={(e) => {
                        const copy = [...dsaList];
                        copy[idx].expected_approach = e.target.value;
                        setDsaList(copy);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Time Limit (mins)</label>
                    <Input
                      type="number"
                      value={p.time_minutes || 25}
                      onChange={(e) => {
                        const copy = [...dsaList];
                        copy[idx].time_minutes = parseInt(e.target.value) || 20;
                        setDsaList(copy);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Coding Tab */}
          <TabsContent value="coding" className="flex-1 overflow-y-auto space-y-4 py-3 pr-2">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Real-world coding architecture and system design challenges.</p>
              <Button size="sm" variant="outline" onClick={addCoding} className="gap-1 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Coding Task
              </Button>
            </div>

            {codingList.map((t, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-pink-500/10 text-pink-500">
                    Task #{t.task_number}
                  </span>
                  <button
                    onClick={() => setCodingList(codingList.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Task Title</label>
                  <Input
                    value={t.title}
                    onChange={(e) => {
                      const copy = [...codingList];
                      copy[idx].title = e.target.value;
                      setCodingList(copy);
                    }}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Description & Specs</label>
                  <Textarea
                    value={t.description}
                    onChange={(e) => {
                      const copy = [...codingList];
                      copy[idx].description = e.target.value;
                      setCodingList(copy);
                    }}
                    className="text-xs min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Tech Stack</label>
                    <Input
                      value={t.tech_stack || ""}
                      onChange={(e) => {
                        const copy = [...codingList];
                        copy[idx].tech_stack = e.target.value;
                        setCodingList(copy);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Time Limit (mins)</label>
                    <Input
                      type="number"
                      value={t.time_minutes || 30}
                      onChange={(e) => {
                        const copy = [...codingList];
                        copy[idx].time_minutes = parseInt(e.target.value) || 30;
                        setCodingList(copy);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* MCQ Tab */}
          <TabsContent value="mcq" className="flex-1 overflow-y-auto space-y-4 py-3 pr-2">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Core computer science & domain knowledge MCQs.</p>
              <Button size="sm" variant="outline" onClick={addMcq} className="gap-1 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Technical MCQ
              </Button>
            </div>

            {mcqList.map((m, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    MCQ #{m.question_number} · {m.topic || "General"}
                  </span>
                  <button
                    onClick={() => setMcqList(mcqList.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Question</label>
                  <Input
                    value={m.question}
                    onChange={(e) => {
                      const copy = [...mcqList];
                      copy[idx].question = e.target.value;
                      setMcqList(copy);
                    }}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(m.options || []).map((opt, optIdx) => {
                    const letter = ["A", "B", "C", "D"][optIdx];
                    return (
                      <div key={optIdx} className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold w-5 ${m.correct_answer === letter ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {letter})
                        </span>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const copy = [...mcqList];
                            copy[idx].options[optIdx] = e.target.value;
                            setMcqList(copy);
                          }}
                          className="h-7 text-xs flex-1"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Correct Answer:</label>
                  {(["A", "B", "C", "D"] as const).map((l) => (
                    <label key={l} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name={`correct-${idx}`}
                        checked={m.correct_answer === l}
                        onChange={() => {
                          const copy = [...mcqList];
                          copy[idx].correct_answer = l;
                          setMcqList(copy);
                        }}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 border-t border-border flex items-center justify-between">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="gap-1.5 bg-primary text-primary-foreground font-semibold">
            <CheckCircle className="h-4 w-4" /> Confirm & Attach Questions ({totalCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
