# DHL eCommerce Customer Master Data Management Briefing

## Executive Summary
The DHL eCommerce (DeC) Master Data Management (MDM) initiative aims to transition from a fragmented, decentralized data environment to a centralized "Golden Record" model. As of February 2026, the Global Customer Data Model is 98% complete, with the project moving into technical Proof of Concept (PoC) assessments and Business Case Analysis (BCA).

The strategic objective of the MDM Hub is to resolve critical operational pain points—specifically manual data entry, synchronization delays, and fragmented identity management—that currently dilute revenue and market opportunity. Financial projections indicate that protecting just 2% of annual customer losses through better data visibility could safeguard approximately €14 million in revenue. Furthermore, improving surcharge compliance by a single percentage point via automated data accuracy could generate €2.6 million in additional EBIT.

The proposed solution utilizes a two-layered architecture—Operational and Golden—to ensure both transactional granularity and a 360-degree analytical view of the customer relationship across all countries and internal DHL business units.

---

## 1. Business Definition and Data Hierarchy
The MDM framework distinguishes between the physical act of shipping and the commercial relationship through a tiered data structure.

### The Account (Operational Building Block)
The Account is the fundamental unit of the relationship, owned by a specific sales organization and representing the lowest level of data granularity. Every shipping entity is defined by up to four distinct roles:
*   **Sold-to**: The primary entity that signed the contract. This is the mandatory parent; other roles cannot exist without a "Sold-to" parent.
*   **Pickup (Physical Shipper)**: The specific location where shipments are collected and to which agreed rates apply.
*   **Bill-to**: The entity designated to receive invoices.
*   **Payer**: The entity responsible for settling invoices.

### The Customer (The Golden Record)
When an entity interacts with DHL across multiple countries or internal companies, individual accounts are aggregated into a Customer record. This "Golden Layer" merges sales, pricing, billing, and accounting attributes to provide a holistic, 360-degree view of the business relationship.

---

## 2. Strategic Categorization Models
To align engagement strategies and market understanding, the MDM model classifies entities by type and industry sector.

### Customer Types
| Customer Type | Definition |
| :--- | :--- |
| **Strategic Customer** | High commercial importance requiring structured account management and long-term planning. |
| **Relationship Customer**| Ongoing commercial relationship managed through assigned sales channels. |
| **Multichannel Digital** | Acquired and served primarily through digital journeys or automated processes. |
| **Reseller** | Entities that purchase DHL services to resell as part of their own commercial offering. |
| **Retail Cash Customer** | Ad hoc/transactional shippers without formal contracts or assigned sales owners. |
| **Partner** | Organizations generating volume through ecosystem agreements rather than end-shipper relationships. |
| **Internal Customer** | DHL internal functions consuming services for cross-business unit purposes. |

### Industry Sectors
Entities are classified into specific sectors (and sub-sectors) to understand market dynamics. Primary sectors include:
*   **Automotive**: Aftermarket retail, component manufacturing, vehicles, and tires.
*   **Consumer**: Durables, FMCG, media, perishables, and print.
*   **Engineering & Manufacturing**: Agricultural, building technologies, construction, and mining infrastructure.
*   **Technology**: Components, consumer electronics, enterprise computing, and semiconductors.
*   **Other Key Sectors**: Chemicals, Energy, Fashion, Financial Services, Life Science & Healthcare, Professional Services, Public Sector, and Retail.

---

## 3. Data Model Architecture
The MDM Hub utilizes a two-layer structure to balance operational needs with analytical insights.

### Operational Layer
This layer maintains maximum data granularity and contains all details required for pricing, sales, billing, accounting, and operations. It serves as the primary layer for system integration.

### Golden Layer
The Golden Layer aggregates records to build a 360-degree customer view. It follows a hierarchical structure:
*   **Legal Entity (Mandatory)**: Aggregation based on Tax ID and Country of Registration.
*   **Country Level**: Optional aggregation.
*   **Regional Level**: Optional aggregation.
*   **Global Level**: Optional aggregation.

### Data Matching and Validation Rules
To ensure data integrity, the system employs both automated and manual matching rules:
*   **Strong Matching**: Exact matches on unique identifiers like Tax ID, Company Registration Number, EORI, or DUNS numbers.
*   **Weak Matching**: Fuzzy matches on legal names, addresses, or bank account details; these require manual approval by data stewards.
*   **Validation**: Automated checks for email syntax, phone number formatting (RFC 3966), and address normalization.

---

## 4. Business Case and Current Pain Points
The transition to a centralized MDM Hub is driven by three critical challenges that impact the bottom line.

### Top 3 Critical Pain Points
1.  **Manual Data Entry**: High effort across departments leads to poor data quality, including typos and duplicates.
2.  **Performance Delays**: Manual or semi-automated data exchange results in information lags.
3.  **Revenue at Risk**: Fragmented records lead to a lack of transparency regarding third-party proxies and missed surcharge potential.

### Revenue Dilution Examples
*   **Douglas Warehouse**: Both Czechia and Poland tendered for the same €1 million opportunity. Only GHO intervention prevented a major price discrepancy.
*   **New Balance Tender**: Both BNL and CBS competed for the same tender. Without a "One Customer" view, DHL risks offering competing prices that dilute the overall opportunity.

### Financial Impact of MDM Implementation
| Metric | Projected Benefit |
| :--- | :--- |
| **Revenue Protection** | Preventing 2% of annual customer losses protects ~€14M in revenue (~€0.84M EBIT). |
| **Surcharge Recovery** | 2025 surcharge compliance was only ~60%. A +1 percentage point improvement in compliance generates ~€2.6M in additional EBIT. |

---

## 5. Implementation Strategy and Solution Evaluation
The project team evaluated several technical paths, moving from decentralized connections to a centralized Hub.

### Technical Options Comparison
| Feature | Point-to-Point (Current) | Central MDM Hub (Proposed) |
| :--- | :--- | :--- |
| **Sync Speed** | Up to days (manual) | Seconds (automated) |
| **Integration Effort** | ≥ 4 connections per system | 1 subscription per application |
| **Resilience** | Very high support effort | Single point of truth; fast response |
| **Governance** | No central governance | Global data governance |

### Vendor Shortlist
*   **Semarchy**: Selected for PoC; noted for strong governance processes.
*   **CluedIn**: Selected for PoC; noted for modern UI and self-service capabilities.
*   *Rejected/No Response*: Reltio (No PaaS), TIBCO EBX (High cost), SAP MDG (No response), IBM Infosphere (No response).

---

## 6. Governance and Ownership Matrix
Data ownership is assigned based on business function to ensure accountability across the lifecycle.

### Entity Ownership Overview
| Entity/Attribute | System Owner |
| :--- | :--- |
| Account (Sold-to/Payer) | SHAPE+ |
| Account (Pickup/Bill-to) | REACH |
| Agreements / Rate Cards | PCOMS |
| Bank Account | SHAPE+ |
| Billing Profile | REACH |
| Customer Type / Industry Sector| REACH |

### Information Classification
To protect sensitive data, the model categorizes information into two levels:
*   **Restricted**: Includes PII (Contact persons, addresses, bank accounts) and standard contracts.
*   **Confidential**: Reserved for special negotiated rates and non-public customer data. This requires special workflows to ensure data is only shared with required consumers (e.g., excluding rates from operations or accounting views).
