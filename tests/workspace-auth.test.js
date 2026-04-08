import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { createWorkspaceAuthService } from "../src/workspace-auth.js";

test("signup creates user, workspace and session", async () => {
  const stateFile = path.join(os.tmpdir(), `workspace-auth-signup-${Date.now()}.json`);
  const auth = createWorkspaceAuthService({
    stateFile,
    now: () => "2026-04-02T20:00:00.000Z"
  });

  const result = await auth.signup({
    name: "Luis",
    email: "luis@example.com",
    password: "12345678",
    workspaceName: "Studio Inovacao"
  });

  assert.ok(result.sessionToken);
  assert.equal(result.session.user.email, "luis@example.com");
  assert.equal(result.session.activeWorkspace.name, "Studio Inovacao");

  const session = await auth.getSession(result.sessionToken);
  assert.equal(session.user.name, "Luis");
  assert.equal(session.workspaces.length, 1);
});

test("login restores access and selectWorkspace switches workspace", async () => {
  const stateFile = path.join(os.tmpdir(), `workspace-auth-login-${Date.now()}.json`);
  let tick = 0;
  const auth = createWorkspaceAuthService({
    stateFile,
    now: () => `2026-04-02T20:10:0${tick += 1}.000Z`
  });

  const signup = await auth.signup({
    name: "Ana",
    email: "ana@example.com",
    password: "segredo123",
    workspaceName: "Primeiro Workspace"
  });

  const createdWorkspace = await auth.createWorkspace(signup.sessionToken, {
    name: "Segundo Workspace"
  });

  const login = await auth.login({
    email: "ana@example.com",
    password: "segredo123"
  });

  assert.equal(login.session.workspaces.length, 2);

  const switched = await auth.selectWorkspace(login.sessionToken, createdWorkspace.workspace.id);
  assert.equal(switched.activeWorkspace.name, "Segundo Workspace");
});

test("login rejects invalid password", async () => {
  const stateFile = path.join(os.tmpdir(), `workspace-auth-invalid-${Date.now()}.json`);
  const auth = createWorkspaceAuthService({
    stateFile,
    now: () => "2026-04-02T20:20:00.000Z"
  });

  await auth.signup({
    name: "Bia",
    email: "bia@example.com",
    password: "senha-forte",
    workspaceName: "Workspace Bia"
  });

  await assert.rejects(
    () => auth.login({
      email: "bia@example.com",
      password: "senha-errada"
    }),
    /Email ou senha invalidos/
  );
});
