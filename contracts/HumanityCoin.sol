// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Humanity Coin (HUMAN)
 * --------------------------------------------------------
 * A community-driven BEP-20 token on Binance Smart Chain.
 * - Symbol:   HUMAN
 * - Decimals: 18
 * - Max Supply: 1,000,000,000 HUMAN (one billion)
 * - 5% allocation seeded to a marketing wallet at deployment
 *   used by the backend to distribute community claims & referral bonuses.
 *
 * The "marketing wallet" is the operational hot wallet from which the
 * Humanity Coin backend pays out daily claims and referral rewards.
 *
 * Marketing wallet (baked in): 0x1eE7dD9BCfbB335a34181275a50af4C92D4851F1
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

abstract contract Ownable {
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "HUMAN: not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "HUMAN: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract HumanityCoin is IERC20, Ownable {
    string  public constant name     = "Humanity Coin";
    string  public constant symbol   = "HUMAN";
    uint8   public constant decimals = 18;

    uint256 private _totalSupply;
    uint256 public  constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1B HUMAN

    // Hard-coded marketing wallet — funds community claims & referrals.
    address public constant MARKETING_WALLET = 0x1eE7dD9BCfbB335a34181275a50af4C92D4851F1;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event MarketingFunded(uint256 amount);
    event ClaimDistributed(address indexed to, uint256 amount, bytes32 indexed reason);

    constructor() {
        // 5% of max supply seeded to the marketing wallet at deploy.
        uint256 marketingAlloc = (MAX_SUPPLY * 5) / 100;
        _mint(MARKETING_WALLET, marketingAlloc);
        emit MarketingFunded(marketingAlloc);

        // Remaining 95% minted to the deployer (treasury) for liquidity, listings,
        // ecosystem and partnerships. Owner can later distribute or burn.
        _mint(msg.sender, MAX_SUPPLY - marketingAlloc);
    }

    // -------------------------- ERC20 --------------------------
    function totalSupply() public view override returns (uint256) { return _totalSupply; }
    function balanceOf(address a) public view override returns (uint256) { return _balances[a]; }
    function allowance(address o, address s) public view override returns (uint256) { return _allowances[o][s]; }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 current = _allowances[from][msg.sender];
        require(current >= amount, "HUMAN: allowance");
        unchecked { _allowances[from][msg.sender] = current - amount; }
        _transfer(from, to, amount);
        return true;
    }

    // ----------------------- Operations ------------------------
    /**
     * Owner-callable convenience to distribute a community claim from the
     * marketing wallet. Requires marketing wallet to have approved this contract.
     * `reason` is a free-form tag (e.g. keccak256("claim:0xabc...")).
     */
    function distributeClaim(address to, uint256 amount, bytes32 reason) external onlyOwner {
        _transferFrom(MARKETING_WALLET, to, amount);
        emit ClaimDistributed(to, amount, reason);
    }

    function burn(uint256 amount) external {
        require(_balances[msg.sender] >= amount, "HUMAN: burn>bal");
        unchecked { _balances[msg.sender] -= amount; _totalSupply -= amount; }
        emit Transfer(msg.sender, address(0), amount);
    }

    // ------------------------ Internals ------------------------
    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "HUMAN: zero addr");
        uint256 bal = _balances[from];
        require(bal >= amount, "HUMAN: balance");
        unchecked { _balances[from] = bal - amount; }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _transferFrom(address from, address to, uint256 amount) internal {
        uint256 current = _allowances[from][msg.sender];
        require(current >= amount, "HUMAN: allowance");
        unchecked { _allowances[from][msg.sender] = current - amount; }
        _transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(_totalSupply + amount <= MAX_SUPPLY, "HUMAN: cap");
        _totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
