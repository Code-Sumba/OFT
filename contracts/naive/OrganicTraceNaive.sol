// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OrganicTraceNaive (comparison only - NOT deployed)
/// @notice "Variant A" for the gas analysis: stores every field, the certificate
///         text and the full human-readable history directly in contract storage.
///         Compare with OrganicTrace (variant B: ids, short fields and an IPFS CID).
contract OrganicTraceNaive {
    struct Batch {
        string batchId;
        string product;
        string quantity;
        string origin;
        string harvestDate;
        string farmerName;
        string farmerOrganisation;
        string certificateText;
        string certifierName;
        uint64 certExpiry;
        uint8 status;
        uint8 stage;
        string currentOwnerName;
    }

    struct Step {
        string fromName;
        string toName;
        string toRole;
        string location;
        string notes;
        uint64 timestamp;
    }

    struct BatchInput {
        string batchId;
        string product;
        string quantity;
        string origin;
        string harvestDate;
        string farmerName;
        string farmerOrganisation;
        string certificateText;
    }

    address public immutable operator;
    mapping(string => Batch) internal batches;
    mapping(string => Step[]) internal history;

    error Unauthorized();
    error InvalidStage();

    constructor() {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    function registerBatch(BatchInput calldata input) external onlyOperator {
        Batch storage b = batches[input.batchId];
        b.batchId = input.batchId;
        b.product = input.product;
        b.quantity = input.quantity;
        b.origin = input.origin;
        b.harvestDate = input.harvestDate;
        b.farmerName = input.farmerName;
        b.farmerOrganisation = input.farmerOrganisation;
        b.certificateText = input.certificateText;
        b.currentOwnerName = input.farmerName;
    }

    function certifyBatch(
        string calldata batchId,
        string calldata certificateText,
        string calldata certifierName,
        uint64 expiry,
        bool approved
    ) external onlyOperator {
        Batch storage b = batches[batchId];
        b.certificateText = certificateText;
        b.certifierName = certifierName;
        b.certExpiry = expiry;
        b.status = approved ? 1 : 2;
    }

    function transferBatch(
        string calldata batchId,
        string calldata toName,
        string calldata toRole,
        string calldata location,
        string calldata notes
    ) external onlyOperator {
        Batch storage b = batches[batchId];
        if (b.stage >= 3) revert InvalidStage();
        b.stage += 1;
        history[batchId].push(Step(b.currentOwnerName, toName, toRole, location, notes, uint64(block.timestamp)));
        b.currentOwnerName = toName;
    }

    function markSold(string calldata batchId, string calldata location) external onlyOperator {
        Batch storage b = batches[batchId];
        if (b.stage != 3) revert InvalidStage();
        b.stage = 4;
        history[batchId].push(Step(b.currentOwnerName, "Consumer", "consumer", location, "Sold at retail", uint64(block.timestamp)));
    }
}
