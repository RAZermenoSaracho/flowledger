import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { server } from "../../../../tests/mocks/server";
import type { Group } from "../../../../types/groups.types";
import type { ParticipantDraft } from "../../types/transactions.types";
import { SharedParticipantsFields } from "../SharedParticipantsFields";

const API_URL = "http://localhost:4000";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Roommates",
    ownerUserId: "user-1",
    isArchived: false,
    members: [
      {
        id: "m1",
        groupId: "group-1",
        userId: "user-2",
        role: "member",
        user: { id: "user-2", name: "Jane", email: "jane@example.com" },
        createdAt: "",
        updatedAt: ""
      }
    ],
    categories: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof SharedParticipantsFields>[0]> = {}) {
  return {
    isShared: true,
    onIsSharedChange: vi.fn(),
    areFieldsOpen: true,
    onToggleFieldsOpen: vi.fn(),
    sharedTitle: "",
    onSharedTitleChange: vi.fn(),
    transactionName: "Dinner",
    selectedGroup: undefined,
    onResetGroupSplit: vi.fn(),
    participantName: "",
    onParticipantNameChange: vi.fn(),
    onAddManualParticipant: vi.fn(),
    userSearch: "",
    onUserSearchChange: vi.fn(),
    onAddUserParticipant: vi.fn(),
    participants: [] as ParticipantDraft[],
    onUpdateParticipantShare: vi.fn(),
    onRemoveParticipant: vi.fn(),
    participantShareTotal: 0,
    transactionAmount: 100,
    remainingSharedAmount: 100,
    executionCurrency: "USD",
    ...overrides
  };
}

describe("SharedParticipantsFields", () => {
  it("hides the Participants toggle and fields when isShared is false", () => {
    renderWithProviders(<SharedParticipantsFields {...baseProps({ isShared: false })} />);
    expect(screen.queryByRole("button", { name: /Participants/ })).not.toBeInTheDocument();
  });

  it("calls onIsSharedChange from the checkbox", async () => {
    const user = userEvent.setup();
    const props = baseProps({ isShared: false });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await user.click(screen.getByRole("checkbox", { name: "Shared transaction" }));

    expect(props.onIsSharedChange).toHaveBeenCalledWith(true);
  });

  it("hides participant fields when areFieldsOpen is false, toggling via the Participants button", async () => {
    const user = userEvent.setup();
    const props = baseProps({ areFieldsOpen: false });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    expect(screen.queryByLabelText("Shared transaction title")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Participants/ }));

    expect(props.onToggleFieldsOpen).toHaveBeenCalledOnce();
  });

  it("uses transactionName as the shared-title placeholder", () => {
    renderWithProviders(<SharedParticipantsFields {...baseProps()} />);
    expect(screen.getByLabelText("Shared transaction title")).toHaveAttribute(
      "placeholder",
      "Dinner"
    );
  });

  it("shows the group-split suggestion and manual-participant field only without/with a selected group", () => {
    const { rerender } = renderWithProviders(<SharedParticipantsFields {...baseProps()} />);
    expect(screen.getByLabelText("Manual participant")).toBeInTheDocument();
    expect(screen.queryByText(/Suggested split from/)).not.toBeInTheDocument();

    const group = makeGroup();
    rerender(<SharedParticipantsFields {...baseProps({ selectedGroup: group })} />);
    expect(screen.getByText(/Suggested split from Roommates/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Manual participant")).not.toBeInTheDocument();
  });

  it("calls onResetGroupSplit from 'Reset split'", async () => {
    const user = userEvent.setup();
    const group = makeGroup();
    const props = baseProps({ selectedGroup: group });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await user.click(screen.getByRole("button", { name: "Reset split" }));

    expect(props.onResetGroupSplit).toHaveBeenCalledWith(group);
  });

  it("calls onAddManualParticipant from 'Add'", async () => {
    const user = userEvent.setup();
    const props = baseProps({ participantName: "Sam" });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(props.onAddManualParticipant).toHaveBeenCalledOnce();
  });

  it("searches app users and shows only group members when a group is selected", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({
          users: [
            { id: "user-2", name: "Jane", email: "jane@example.com" },
            { id: "user-3", name: "Sam", email: "sam@example.com" }
          ]
        })
      )
    );
    const user = userEvent.setup();
    const props = baseProps({ selectedGroup: makeGroup(), userSearch: "a" });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await user.type(screen.getByLabelText("Find app user"), "a");
    expect(props.onUserSearchChange).toHaveBeenCalled();
  });

  it("shows eligible app users and calls onAddUserParticipant", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-2", name: "Jane", email: "jane@example.com" }] })
      )
    );
    const user = userEvent.setup();
    const props = baseProps({ userSearch: "jane" });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await waitFor(() => expect(screen.getByText("jane@example.com")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add app user" }));

    expect(props.onAddUserParticipant).toHaveBeenCalledWith({
      id: "user-2",
      name: "Jane",
      email: "jane@example.com"
    });
  });

  it("filters out a searched user who isn't a member of the selected group", async () => {
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-3", name: "Sam", email: "sam@example.com" }] })
      )
    );
    const props = baseProps({ selectedGroup: makeGroup(), userSearch: "sam" });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    await waitFor(() => expect(screen.getByText("No eligible app users found.")).toBeInTheDocument());
  });

  it("renders participant rows and updates/removes them", async () => {
    const user = userEvent.setup();
    const participant: ParticipantDraft = {
      draftId: "d1",
      participantName: "Sam",
      source: "manual",
      shareAmount: "50"
    };
    const props = baseProps({ participants: [participant], participantShareTotal: 50 });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getAllByText("Manual participant").length).toBeGreaterThan(1);
    expect(screen.getByText(/Assigned \$50\.00 of \$100\.00/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Share"));
    await user.type(screen.getByLabelText("Share"), "60");
    expect(props.onUpdateParticipantShare).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(props.onRemoveParticipant).toHaveBeenCalledWith("d1");
  });

  it("labels an app-sourced participant with its email", () => {
    const participant: ParticipantDraft = {
      draftId: "d1",
      userId: "user-2",
      participantName: "Jane",
      email: "jane@example.com",
      source: "app",
      shareAmount: "50"
    };
    renderWithProviders(<SharedParticipantsFields {...baseProps({ participants: [participant] })} />);

    expect(screen.getByText("App user · jane@example.com")).toBeInTheDocument();
  });

  it("shows an over-by warning when participant shares exceed the transaction amount", () => {
    const participant: ParticipantDraft = {
      draftId: "d1",
      participantName: "Sam",
      source: "manual",
      shareAmount: "150"
    };
    const props = baseProps({
      participants: [participant],
      participantShareTotal: 150,
      transactionAmount: 100,
      remainingSharedAmount: -50
    });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    expect(
      screen.getByText(/Over by \$50\.00 — participant shares cannot exceed the transaction amount\./)
    ).toBeInTheDocument();
  });

  it("does not show the over-by warning when shares are within the amount", () => {
    const participant: ParticipantDraft = {
      draftId: "d1",
      participantName: "Sam",
      source: "manual",
      shareAmount: "50"
    };
    const props = baseProps({ participants: [participant], participantShareTotal: 50 });
    renderWithProviders(<SharedParticipantsFields {...props} />);

    expect(screen.queryByText(/Over by/)).not.toBeInTheDocument();
  });

  it("shows the add-a-participant prompt when there are none", () => {
    renderWithProviders(<SharedParticipantsFields {...baseProps()} />);
    expect(
      screen.getByText("Add an app user or manual participant to create a shared transaction split.")
    ).toBeInTheDocument();
  });
});
