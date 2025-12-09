// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/security/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/IERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/interfaces/IERC2981.sol";

contract Marketplace is ReentrancyGuard, Ownable {
    struct Listing {
        address seller;
        address nftAddress;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    uint256 public feeBasis;
    address public feeRecipient;
    uint256 private _listingCounter;

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed listingId, address indexed seller, address indexed nft, uint256 tokenId, uint256 price);
    event Bought(uint256 indexed listingId, address indexed buyer, uint256 price);
    event Cancelled(uint256 indexed listingId);

    constructor(address _feeRecipient, uint256 _feeBasis) 
        Ownable(msg.sender) 
    {
        require(_feeBasis <= 1000, "Fee too high"); 
        feeRecipient = _feeRecipient;
        feeBasis = _feeBasis;
        _listingCounter = 0;
    }

    function setFeeBasis(uint256 _feeBasis) external onlyOwner {
        require(_feeBasis <= 2000, "Fee > 20%");
        feeBasis = _feeBasis;
    }

    function listItem(address nftAddress, uint256 tokenId, uint256 price) 
        external 
        nonReentrant 
    {
        require(price > 0, "Price>0");

        IERC721 nft = IERC721(nftAddress);

        require(nft.ownerOf(tokenId) == msg.sender, "Not owner");
        require(
            nft.getApproved(tokenId) == address(this) || 
            nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        _listingCounter += 1;
        listings[_listingCounter] = Listing(msg.sender, nftAddress, tokenId, price, true);

        emit Listed(_listingCounter, msg.sender, nftAddress, tokenId, price);
    }

    function buy(uint256 listingId) external payable nonReentrant {
    Listing storage l = listings[listingId];
    require(l.active, "Not active");
    require(msg.value == l.price, "Incorrect value");

    l.active = false;

    uint256 fee = (msg.value * feeBasis) / 10000;
    uint256 afterFee = msg.value - fee;

    // pagar fee
    if (fee > 0) {
        (bool sentFee, ) = payable(feeRecipient).call{value: fee}("");
        require(sentFee, "Fee transfer failed");
    }

    // obtener royalties ERC2981
    (address royaltyReceiver, uint256 royaltyAmount) =
        IERC2981(l.nftAddress).royaltyInfo(l.tokenId, msg.value);

    uint256 sellerPayment = afterFee - royaltyAmount;

    // pagar royalties
    if (royaltyAmount > 0) {
        (bool sentRoyalties, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
        require(sentRoyalties, "Royalty payment failed");
    }

    // pagar al vendedor
    (bool sentSeller, ) = payable(l.seller).call{value: sellerPayment}("");
    require(sentSeller, "Seller transfer failed");

    // transferir NFT
    IERC721(l.nftAddress).safeTransferFrom(l.seller, msg.sender, l.tokenId);

    emit Bought(listingId, msg.sender, msg.value);
}


    function cancel(uint256 listingId) 
        external 
        nonReentrant 
    {
        Listing storage l = listings[listingId];
        require(l.active, "Not active");
        require(l.seller == msg.sender, "Not seller");
        l.active = false;

        emit Cancelled(listingId);
    }

    receive() external payable {}
}
