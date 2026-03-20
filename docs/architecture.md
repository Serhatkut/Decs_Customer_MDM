# Technical Architecture - Customer Master Data Viewer

This document provides a deep dive into the technical implementation of the Customer MDM Viewer.

## 1. Data Model

The application operates on a hierarchical JSON structure defined in `data/customerData.json`.

### Object Hierarchy
- **GLOBAL_CUSTOMER**: Top-level entity for strategic accounts spanning multiple regions.
- **CUSTOMER**: A local or regional legal entity.
- **ACCOUNT**: A billing or sales-related account (Sold-To, Payer, etc.).
- **CONTRACT**: Individual logistics contracts associated with an account.
- **BILLING**: Billing profiles and payment terms.
- **ADDRESS**: Registered, business, or operational addresses.
- **CONTACT**: Business and technical contact persons.
- **PLATFORM**: IT integration details (EDI, API, Portals).

### Reference Data (`data/reference_master_data.json`)
Defines the "Source of Truth" for:
- **Domains**: Allowed values for Industry Sectors, Sales Channels, and Customer Types.
- **Validation Rules**: Mandatory fields and sales channel mapping logic.

## 2. Component Analysis (`script.js`)

The application logic is encapsulated in an IIFE (Immediately Invoked Function Expression) to avoid global namespace pollution.

### State Management
- `dataset`: The full list of scenarios loaded at boot.
- `currentScenario`: The currently selected scenario object.
- `hiddenTypes`: A `Set` of object types currently hidden via the legend.
- `collapsedKeys`: A `Set` of stable keys (`TYPE:ID`) representing collapsed tree nodes.

### Rendering Pipeline
1. **Scenario Selection**: Triggered by the dropdown or filters.
2. **Tree Building**: `buildTreeForScenario` recursively transforms flat MDM data into a nested structure suitable for `d3.hierarchy`.
3. **D3 Layout**: Uses `d3.tree()` with custom node spacing.
4. **SVG Generation**: Renders nodes (cards) and links (orthogonal paths).
5. **Zoom & Fit**: Automatically calculates scale and translation to center the visualization.

## 3. Design System

### Color System (`data/reference_colors.json`)
Colors are managed through CSS variables defined in `:root`.
- **Primary Palette**: DHL Brand colors (Red #D40511, Yellow #FFCC00).
- **Semantic Tokens**: Each object type has a specific header and body color to improve scannability.

### Visual Cues
- **Transparency**: Objects that don't match the current filters are dimmed.
- **Badges**: The "DQ" badge provides instant visual feedback on data consistency.
- **Icons**: Each node type uses a specific emoji/icon for immediate identification.

## 4. UI Interactions
- **Legend**: Clicking legend items toggles the visibility of entire object categories.
- **+/- Toggles**: Individual branch collapsing/expanding.
- **Inspector**: Real-time JSON viewing and data classification.
