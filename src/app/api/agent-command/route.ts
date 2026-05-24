import { NextRequest, NextResponse } from "next/server";
import {
  createMission,
  getAgentCommandSnapshot,
  postAgentMessage,
  updateEngine,
  updateMission,
  updateTask,
  type EngineStatus,
  type MessageKind,
  type MissionStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/agent-command-center";

export const runtime = "nodejs";

type CommandBody =
  | {
      action: "create-mission";
      title: string;
      brief: string;
      priority?: TaskPriority;
    }
  | {
      action: "update-task";
      taskId: string;
      status?: TaskStatus;
      assignedEngineId?: string;
      title?: string;
      description?: string;
    }
  | {
      action: "update-engine";
      engineId: string;
      status: EngineStatus;
    }
  | {
      action: "update-mission";
      missionId: string;
      status: MissionStatus;
    }
  | {
      action: "post-message";
      missionId?: string;
      taskId?: string;
      from?: string;
      targetEngineIds?: string[];
      kind?: MessageKind;
      body: string;
    };

export async function GET() {
  return NextResponse.json(getAgentCommandSnapshot());
}

export async function POST(req: NextRequest) {
  let body: CommandBody;
  try {
    body = (await req.json()) as CommandBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "create-mission") {
      if (!body.title?.trim() || !body.brief?.trim()) {
        return NextResponse.json({ error: "title and brief are required" }, { status: 400 });
      }
      return NextResponse.json(createMission({
        title: body.title,
        brief: body.brief,
        priority: body.priority,
      }));
    }

    if (body.action === "update-task") {
      if (!body.taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });
      return NextResponse.json(updateTask(body));
    }

    if (body.action === "update-engine") {
      if (!body.engineId || !body.status) {
        return NextResponse.json({ error: "engineId and status are required" }, { status: 400 });
      }
      return NextResponse.json(updateEngine(body));
    }

    if (body.action === "update-mission") {
      if (!body.missionId) return NextResponse.json({ error: "missionId is required" }, { status: 400 });
      return NextResponse.json(updateMission(body));
    }

    if (body.action === "post-message") {
      if (!body.body?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });
      return NextResponse.json(postAgentMessage(body));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status: 500 },
    );
  }
}
