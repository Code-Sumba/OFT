// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OrganicTrace
/// @notice Tamper-evident record of organic produce batches: registration,
///         certification and forward-only transfers along the supply chain.
/// @dev The backend relayer sends most transactions, so per-user permissions are
///      enforced off-chain. Actors are recorded as bytes32 ids (hash of user UUID).
///      The contract enforces stage order and certification status on-chain.
contract OrganicTrace is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

    /// @dev Keeps strings short; large data belongs on IPFS.
    uint256 public constant MAX_STRING_LENGTH = 128;

    enum Stage {
        Farmer,
        Processor,
        Distributor,
        Retailer,
        Sold
    }

    enum Status {
        Registered,
        Certified,
        Rejected
    }

    struct Batch {
        string batchId;
        string product;
        string origin;
        uint64 harvestDate;
        bytes32 farmerId;
        string certificateCID;
        uint64 certExpiry;
        Status status;
        Stage stage;
        bytes32 currentOwner;
        bool exists;
    }

    struct Transfer {
        bytes32 fromActor;
        bytes32 toActor;
        Stage toStage;
        string location;
        uint64 timestamp;
    }

    mapping(string => Batch) private _batches;
    mapping(string => Transfer[]) private _history;

    event BatchRegistered(string batchId, bytes32 indexed farmerId, string product, uint64 timestamp);
    event BatchCertified(string batchId, bytes32 indexed certifierId, bool approved, string certCID, uint64 expiry);
    event BatchTransferred(
        string batchId,
        bytes32 indexed fromActor,
        bytes32 indexed toActor,
        Stage toStage,
        string location,
        uint64 timestamp
    );
    event BatchSold(string batchId, string location, uint64 timestamp);

    error BatchAlreadyExists(string batchId);
    error BatchNotFound(string batchId);
    error BatchNotCertified(string batchId);
    error BatchAlreadySold(string batchId);
    error InvalidStageTransition(Stage current, Stage requested);
    error NotAtRetailer(Stage current);
    error ExpiryNotInFuture(uint64 expiry);
    error EmptyField(string field);
    error StringTooLong(string field);
    error ZeroActor();
    error Unauthorized(address caller);

    constructor(address admin, address relayer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
    }

    modifier onlyRelayer() {
        if (!hasRole(RELAYER_ROLE, msg.sender)) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyCertifierOrRelayer() {
        if (!hasRole(CERTIFIER_ROLE, msg.sender) && !hasRole(RELAYER_ROLE, msg.sender)) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    // ---------------------------------------------------------------- writes

    function registerBatch(
        string calldata batchId,
        string calldata product,
        string calldata origin,
        uint64 harvestDate,
        bytes32 farmerId,
        string calldata certCID
    ) external onlyRelayer {
        _checkString(batchId, "batchId", true);
        _checkString(product, "product", true);
        _checkString(origin, "origin", true);
        _checkString(certCID, "certCID", false);
        if (farmerId == bytes32(0)) revert ZeroActor();
        if (_batches[batchId].exists) revert BatchAlreadyExists(batchId);

        _batches[batchId] = Batch({
            batchId: batchId,
            product: product,
            origin: origin,
            harvestDate: harvestDate,
            farmerId: farmerId,
            certificateCID: certCID,
            certExpiry: 0,
            status: Status.Registered,
            stage: Stage.Farmer,
            currentOwner: farmerId,
            exists: true
        });

        emit BatchRegistered(batchId, farmerId, product, uint64(block.timestamp));
    }

    /// @notice Approve or reject a batch. May be called again before the batch is
    ///         sold, e.g. to renew an expiring certificate or revoke approval.
    function certifyBatch(
        string calldata batchId,
        string calldata certCID,
        uint64 expiry,
        bool approved,
        bytes32 certifierId
    ) external onlyCertifierOrRelayer {
        Batch storage b = _existing(batchId);
        if (b.stage == Stage.Sold) revert BatchAlreadySold(batchId);
        if (certifierId == bytes32(0)) revert ZeroActor();

        if (approved) {
            if (expiry <= block.timestamp) revert ExpiryNotInFuture(expiry);
            _checkString(certCID, "certCID", true);
            b.certificateCID = certCID;
            b.certExpiry = expiry;
            b.status = Status.Certified;
        } else {
            b.status = Status.Rejected;
            b.certExpiry = 0;
        }

        emit BatchCertified(batchId, certifierId, approved, b.certificateCID, b.certExpiry);
    }

    /// @notice Move a certified batch exactly one stage forward.
    /// @param toStage Must equal the current stage + 1 (Processor, Distributor or Retailer).
    function transferBatch(
        string calldata batchId,
        bytes32 toActor,
        Stage toStage,
        string calldata location
    ) external onlyRelayer {
        Batch storage b = _existing(batchId);
        if (b.status != Status.Certified) revert BatchNotCertified(batchId);
        if (toActor == bytes32(0)) revert ZeroActor();
        if (b.stage >= Stage.Retailer || uint8(toStage) != uint8(b.stage) + 1) {
            revert InvalidStageTransition(b.stage, toStage);
        }
        _checkString(location, "location", true);

        bytes32 fromActor = b.currentOwner;
        b.stage = toStage;
        b.currentOwner = toActor;

        uint64 ts = uint64(block.timestamp);
        _history[batchId].push(Transfer(fromActor, toActor, toStage, location, ts));

        emit BatchTransferred(batchId, fromActor, toActor, toStage, location, ts);
    }

    function markSold(string calldata batchId, string calldata location) external onlyRelayer {
        Batch storage b = _existing(batchId);
        if (b.stage != Stage.Retailer) revert NotAtRetailer(b.stage);
        _checkString(location, "location", true);

        b.stage = Stage.Sold;

        uint64 ts = uint64(block.timestamp);
        _history[batchId].push(Transfer(b.currentOwner, bytes32(0), Stage.Sold, location, ts));

        emit BatchSold(batchId, location, ts);
    }

    // ----------------------------------------------------------------- views

    function getBatch(string calldata batchId) external view returns (Batch memory) {
        Batch storage b = _batches[batchId];
        if (!b.exists) revert BatchNotFound(batchId);
        return b;
    }

    function getHistory(string calldata batchId) external view returns (Transfer[] memory) {
        if (!_batches[batchId].exists) revert BatchNotFound(batchId);
        return _history[batchId];
    }

    function batchExists(string calldata batchId) external view returns (bool) {
        return _batches[batchId].exists;
    }

    // -------------------------------------------------------------- internal

    function _existing(string calldata batchId) private view returns (Batch storage b) {
        b = _batches[batchId];
        if (!b.exists) revert BatchNotFound(batchId);
    }

    function _checkString(string calldata value, string memory field, bool required) private pure {
        uint256 len = bytes(value).length;
        if (required && len == 0) revert EmptyField(field);
        if (len > MAX_STRING_LENGTH) revert StringTooLong(field);
    }
}
