# Spec Delta

## ADDED Requirements

### Requirement: Publish a model

Publishing SHALL create the next immutable, numbered version of the model, snapshotting its name, description, code, slots and settings, never its bindings, and SHALL make the model public. Only the owner SHALL be able to publish.
Publishing SHALL be the only way a model becomes public: a model update SHALL NOT set it public, so a model is never public without a published version.

#### Scenario: Public only through publishing
- **WHEN** the owner updates a model with `visibility: "public"` instead of publishing
- **THEN** the request is rejected with 400 and the model stays private and absent from the library

#### Scenario: First publish
- **WHEN** the owner publishes a private model
- **THEN** version 1 exists with name, description, code, slots and settings, and the model is public

#### Scenario: Republish
- **WHEN** the owner changes the code and publishes again
- **THEN** version 2 is created and version 1 is unchanged

#### Scenario: Bindings not published
- **WHEN** a model with bound accounts is published
- **THEN** the version contains no bindings or record ids

#### Scenario: Not the owner
- **WHEN** another user publishes the model
- **THEN** the response is 404

### Requirement: Unpublish

Making a model private SHALL hide it from the library. Copies already installed SHALL be unaffected.

#### Scenario: Unpublish
- **WHEN** the owner sets the model to private
- **THEN** it no longer appears in the library and existing copies keep working

### Requirement: Browse the library

The library SHALL list public models that have at least one version, showing the latest version and the author's public username. It SHALL NOT expose email addresses, bindings or any private data.

#### Scenario: Listing
- **WHEN** a user browses the library
- **THEN** only public models with a version appear, with latest version and author username

#### Scenario: Private data
- **WHEN** a library entry is returned
- **THEN** it contains no email, binding or record id

### Requirement: View code before installing

A user SHALL be able to view a library model's latest code, slots and settings before installing it.

#### Scenario: View
- **WHEN** a user opens a library model
- **THEN** the latest version's code, description, slots and settings are shown

### Requirement: Install a copy

Installing SHALL create an independent, private, inactive copy owned by the installer, with its own id, endpoint and runs, empty bindings, and a record of the version it came from. The original author's record ids SHALL never be carried over.
An author SHALL see their own published models in the library, marked as their own, but SHALL NOT be able to install them. Library entries SHALL tell the caller whether they already installed a copy.

#### Scenario: Author sees but cannot install their own model
- **WHEN** the author browses the library and tries to install their own published model
- **THEN** the entry is listed and marked as theirs, and the install request is rejected with 400

#### Scenario: Already installed
- **WHEN** a user who installed a copy browses the library
- **THEN** that entry links to their existing copy

#### Scenario: Install
- **WHEN** a user installs a library model
- **THEN** a private inactive copy exists with the latest version's code, slots and settings, no bindings, and the source version recorded

#### Scenario: Independence
- **WHEN** the author later edits or unpublishes the original
- **THEN** the copy's code, endpoint and runs are unchanged

#### Scenario: Activation needs bindings
- **WHEN** the installer activates the copy before binding required slots
- **THEN** the response is 400 listing the slots

### Requirement: Update availability

A copy SHALL report that an update is available when its source model is public and has a newer version, giving the installed and latest version numbers and whether the copy's code was modified locally. Updates SHALL never be applied automatically.

#### Scenario: Update available
- **WHEN** the source publishes version 3 and the copy is at version 2
- **THEN** the copy reports an update with installed 2, latest 3

#### Scenario: Locally modified
- **WHEN** the copy's code differs from the installed version
- **THEN** the update info flags it as locally modified

#### Scenario: No automatic update
- **WHEN** a newer version exists and time passes
- **THEN** the copy's code is unchanged until the owner applies the update

### Requirement: Apply an update

Applying an update SHALL replace the copy's code, description and slots with the new version's, keep the user's name, and merge settings by keeping the user's values for keys that still exist, adding new keys with their defaults and dropping removed keys. Bindings SHALL be kept where a slot's key and kind are unchanged. Required slots left without a binding SHALL have to be supplied in the request, otherwise the request SHALL fail with 400 listing them. The model SHALL remain runnable after the update.

#### Scenario: Update keeps user data
- **WHEN** the owner applies an update
- **THEN** the code, description and slots are the new version's, the name and surviving settings values and matching bindings are kept, and the source version is recorded

#### Scenario: New required slot
- **WHEN** the new version adds a required slot and no binding is supplied
- **THEN** the response is 400 listing the slot and nothing changes

#### Scenario: Binding supplied
- **WHEN** the owner supplies a binding for the new required slot
- **THEN** the update is applied and the model keeps running

#### Scenario: Slot kind changed
- **WHEN** a slot keeps its key but changes kind
- **THEN** its old binding is dropped and must be supplied again if required

#### Scenario: Declining
- **WHEN** the owner never applies the update
- **THEN** the copy keeps working on its current version

### Requirement: Original removed

When the original model is deleted, copies SHALL keep working with their code and SHALL lose update tracking.

#### Scenario: Original deleted
- **WHEN** the author deletes the original
- **THEN** copies still process notifications and report no update

### Requirement: Only the owner changes a model's publication

Only the owner SHALL be able to publish, unpublish or apply updates to a model.

#### Scenario: Foreign owner
- **WHEN** a user publishes or updates a model they do not own
- **THEN** the response is 404 and nothing changes
