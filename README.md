# DHL eCommerce – Customer Master Data Viewer

An interactive, web-based tool for visualizing and exploring DHL eCommerce Customer Master Data (MDM) scenarios. This application uses D3.js to render hierarchical relationships between global customers, local entities, accounts, contracts, and more.

## Key Features

- **Hierarchical Visualization**: Interactive tree layout showing the full MDM lifecycle.
- **Scenario Switching**: Easily toggle between different customer data scenarios (e.g., Inditex, Amazon, SME).
- **Advanced Filtering**: Filter by Customer Type, Industry Sector, and Sales Channel.
- **Data Inspector**: Detailed side panel showing object classification, business meaning, and raw JSON data.
- **Smart Validation**: Data Quality (DQ) indicator that validates if the displayed scenario matches the selected criteria.
- **Responsive Layout**: Collapsible inspector and zoom-to-fit capabilities.

## Project Structure

- `index.html`: Main application entry point.
- `script.js`: Core logic, D3 rendering, and UI interactions.
- `style.css`: Application styling and design tokens.
- `docs/`:
  - `architecture.md`: Technical architecture and data model documentation.
  - `briefing.md`: Executive summary and business context for the MDM initiative.
- `data/`:
  - `customerData.json`: The primary dataset containing MDM scenarios.
  - `reference_master_data.json`: Schema definitions, domains (industries, channels), and business rules.
  - `reference_colors.json`: Semantic color mapping for different object types.

## How to Run

Since the application fetches data via `fetch()`, it must be run from a local web server (to avoid CORS issues).

### Using VS Code 'Live Server'
1. Install the "Live Server" extension.
2. Right-click `index.html` and select **Open with Live Server**.

### Using Python
Run one of the following commands in the project root:
- `python3 -m http.server 8000`
- `python -m SimpleHTTPServer 8000`

Then open `http://localhost:8000` in your browser.

## Technologies Used

- **D3.js (v7)**: For hierarchical data layout and svg rendering.
- **Vanilla JavaScript (ES6+)**: For application logic and state management.
- **CSS3**: For layout (Flexbox/Grid) and animations.
- **HTML5**: For semantic structure.

---
*Created by Serhat Kut, PhD*
