// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HumanityCoin (HC)
 * @notice BEP-20 token with USD-pegged claim, automatic BNB split (marketing + liquidity),
 *         92-day token lock and PancakeSwap-ready liquidity helper.
 *
 *  Claim flow:
 *    1. User sends ~$6 worth of BNB to claim().
 *    2. Contract uses Chainlink BNB/USD oracle to verify amount.
 *    3. $3 is forwarded to the marketing wallet.
 *    4. $3 is forwarded to the liquidity wallet (or auto-added to PancakeSwap pool).
 *    5. User receives 2,000 HC ($1,000 at $0.50 / HC) — locked for 92 days.
 *    6. After the lock elapses, the tokens are freely transferable.
 *
 *  Designed for BNB Smart Chain (BSC) Mainnet (chainId 56) or Testnet (chainId 97).
 *  Audit before mainnet deployment.
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

interface IPriceFeed {
    function latestRoundData()
        external
        view
        returns (uint80, int256 answer, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

interface IPancakeRouter {
    function WETH() external pure returns (address);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint, uint, uint);
}

contract HumanityCoin is IERC20 {
    // ---------- ERC20 metadata ----------
    string public constant name = "Humanity Coin";
    string public constant symbol = "HC";
    uint8  public constant decimals = 18;
    uint256 private _totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // ---------- Economics ----------
    uint256 public constant TOKEN_PRICE_USD = 50;        // $0.50  -> 50 cents
    uint256 public constant CLAIM_COST_USD  = 6;         // $6 per claim
    uint256 public constant CLAIM_REWARD_USD = 1000;     // $1000 reward
    uint256 public constant LOCK_DURATION    = 92 days;
    uint256 public constant CLAIM_REWARD_TOKENS = 2000 * 10 ** 18; // 2,000 HC

    // ---------- Wallets ----------
    address public owner;
    address public marketingWallet;
    address public liquidityWallet;       // receives LP tokens (NOT raw BNB once autoLP is on)

    // ---------- Oracle ----------
    IPriceFeed public bnbUsdFeed;          // Chainlink BNB/USD
    IPancakeRouter public pancakeRouter;   // PancakeSwap V2 router
    bool public autoLiquidity = true;      // when true, $3 BNB half is auto-paired with HC on PancakeSwap
    // $3 / $0.50 per HC = 6 HC paired per claim
    uint256 public constant HC_PER_LP_CLAIM = 6 * 10 ** 18;

    // ---------- Lock tracking ----------
    struct Lock {
        uint256 amount;
        uint256 unlockAt;
        bool    claimed;
    }
    mapping(address => Lock) public locks;

    // ---------- Referral ----------
    mapping(address => uint256) public referralCount;
    mapping(address => uint256) public referralEarnings;
    uint256 public constant REFERRAL_REWARD = 200 * 10 ** 18; // 200 HC ($100)

    // ---------- Events ----------
    event Claimed(address indexed user, uint256 bnbPaid, uint256 hcAmount, uint256 unlockAt);
    event Split(uint256 marketingBnb, uint256 liquidityBnb);
    event AutoLPAdded(uint256 bnbAmount, uint256 hcAmount);
    event AutoLPFailed(uint256 bnbAmount, string reason);
    event Unlocked(address indexed user, uint256 amount);
    event ReferralPaid(address indexed referrer, address indexed claimer, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _marketing,
        address _liquidity,
        address _bnbUsdFeed,
        address _pancakeRouter
    ) {
        owner            = msg.sender;
        marketingWallet  = _marketing;
        liquidityWallet  = _liquidity;
        bnbUsdFeed       = IPriceFeed(_bnbUsdFeed);
        pancakeRouter    = IPancakeRouter(_pancakeRouter);

        // Mint full supply (1,000,000,000 HC) to the contract for distribution.
        _totalSupply = 1_000_000_000 * 10 ** 18;
        _balances[address(this)] = _totalSupply;
        emit Transfer(address(0), address(this), _totalSupply);
    }

    // ---------- ERC20 ----------
    function totalSupply() external view override returns (uint256) { return _totalSupply; }
    function balanceOf(address a) external view override returns (uint256) { return _balances[a]; }
    function allowance(address o, address s) external view override returns (uint256) { return _allowances[o][s]; }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _enforceLock(msg.sender, amount);
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(_allowances[from][msg.sender] >= amount, "Allowance");
        _allowances[from][msg.sender] -= amount;
        _enforceLock(from, amount);
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(_balances[from] >= amount, "Balance");
        _balances[from] -= amount;
        _balances[to]   += amount;
        emit Transfer(from, to, amount);
    }

    // ---------- Lock logic ----------
    /// @dev Reverts if `from` still has locked tokens that would be transferred.
    function _enforceLock(address from, uint256 amount) internal view {
        Lock memory l = locks[from];
        if (l.amount > 0 && block.timestamp < l.unlockAt) {
            // Locked balance must remain in the wallet
            uint256 spendable = _balances[from] > l.amount ? _balances[from] - l.amount : 0;
            require(amount <= spendable, "HC: tokens locked for 92 days");
        }
    }

    function lockedBalanceOf(address user) external view returns (uint256) {
        Lock memory l = locks[user];
        if (l.amount == 0 || block.timestamp >= l.unlockAt) return 0;
        return l.amount;
    }

    function unlockAt(address user) external view returns (uint256) {
        return locks[user].unlockAt;
    }

    // ---------- Pricing ----------
    /// @notice Returns the live BNB price in USD with 8 decimals (Chainlink convention).
    function getBnbUsdPrice() public view returns (uint256) {
        (, int256 answer,,,) = bnbUsdFeed.latestRoundData();
        require(answer > 0, "Bad oracle");
        return uint256(answer);
    }

    /// @notice Wei value of $6 at the current BNB/USD price.
    function claimCostInWei() public view returns (uint256) {
        uint256 price = getBnbUsdPrice();           // 8 decimals
        // wei = (usd * 1e18 * 1e8) / price
        return (CLAIM_COST_USD * 1e18 * 1e8) / price;
    }

    // ---------- Claim ----------
    /**
     * @notice Claim 2,000 HC by sending ~$6 of BNB.
     * @param referrer Optional referrer address (zero-address if none).
     */
    function claim(address referrer) external payable {
        require(locks[msg.sender].amount == 0, "Already claimed");

        uint256 required = claimCostInWei();
        // allow 2% slippage on the oracle price
        require(msg.value >= (required * 98) / 100, "Insufficient BNB (need ~$6)");

        // Split BNB 50/50: $3 marketing + $3 liquidity
        uint256 half       = msg.value / 2;
        uint256 lpBnbHalf  = msg.value - half;
        (bool ok1, ) = marketingWallet.call{value: half}("");
        require(ok1, "Marketing transfer failed");
        emit Split(half, lpBnbHalf);

        // Atomically pair the liquidity half with 6 HC on PancakeSwap.
        if (autoLiquidity && address(pancakeRouter) != address(0)) {
            _autoAddLiquidity(lpBnbHalf);
        } else {
            // Fallback: forward raw BNB to the liquidity wallet for manual LP later.
            (bool ok2, ) = liquidityWallet.call{value: lpBnbHalf}("");
            require(ok2, "Liquidity transfer failed");
        }

        // Transfer 2,000 HC to user and create the 92-day lock
        uint256 amount = CLAIM_REWARD_TOKENS;
        _balances[address(this)] -= amount;
        _balances[msg.sender]    += amount;
        emit Transfer(address(this), msg.sender, amount);

        locks[msg.sender] = Lock({
            amount:   amount,
            unlockAt: block.timestamp + LOCK_DURATION,
            claimed:  true
        });
        emit Claimed(msg.sender, msg.value, amount, block.timestamp + LOCK_DURATION);

        // Referral payout — instant 200 HC, no lock
        if (referrer != address(0) && referrer != msg.sender) {
            _balances[address(this)] -= REFERRAL_REWARD;
            _balances[referrer]       += REFERRAL_REWARD;
            emit Transfer(address(this), referrer, REFERRAL_REWARD);
            referralCount[referrer]    += 1;
            referralEarnings[referrer] += REFERRAL_REWARD;
            emit ReferralPaid(referrer, msg.sender, REFERRAL_REWARD);
        }
    }

    // ---------- Admin ----------
    function setWallets(address _marketing, address _liquidity) external onlyOwner {
        marketingWallet = _marketing;
        liquidityWallet = _liquidity;
    }

    function setOracle(address _feed) external onlyOwner {
        bnbUsdFeed = IPriceFeed(_feed);
    }

    function setRouter(address _router) external onlyOwner {
        pancakeRouter = IPancakeRouter(_router);
    }

    function setAutoLiquidity(bool enabled) external onlyOwner {
        autoLiquidity = enabled;
    }

    /// @dev Pair `bnbAmount` with 6 HC on PancakeSwap. LP tokens are sent to liquidityWallet.
    ///      Reverts to a raw BNB transfer if the router call fails (so claims never get stuck).
    function _autoAddLiquidity(uint256 bnbAmount) internal {
        uint256 hcAmount = HC_PER_LP_CLAIM;

        // Approve the router to pull HC from this contract.
        _allowances[address(this)][address(pancakeRouter)] = hcAmount;
        emit Approval(address(this), address(pancakeRouter), hcAmount);

        try pancakeRouter.addLiquidityETH{value: bnbAmount}(
            address(this), hcAmount, 0, 0, liquidityWallet, block.timestamp + 600
        ) returns (uint, uint, uint) {
            emit AutoLPAdded(bnbAmount, hcAmount);
        } catch Error(string memory reason) {
            emit AutoLPFailed(bnbAmount, reason);
            (bool ok, ) = liquidityWallet.call{value: bnbAmount}("");
            require(ok, "LP fallback failed");
        } catch {
            emit AutoLPFailed(bnbAmount, "unknown");
            (bool ok, ) = liquidityWallet.call{value: bnbAmount}("");
            require(ok, "LP fallback failed");
        }
    }

    /// @notice Manual helper to top up PancakeSwap LP (owner-only).
    function addLiquidityManual(uint256 tokenAmount) external payable onlyOwner {
        _allowances[address(this)][address(pancakeRouter)] = tokenAmount;
        emit Approval(address(this), address(pancakeRouter), tokenAmount);
        pancakeRouter.addLiquidityETH{value: msg.value}(
            address(this), tokenAmount, 0, 0, liquidityWallet, block.timestamp + 600
        );
    }

    receive() external payable {}
}
