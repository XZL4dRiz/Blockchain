// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/common/ERC2981.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/access/Ownable.sol";

contract ArtNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 private _nextTokenId;
    address public marketplace;

    struct MintInfo {
        address originalCreator;
    }

    mapping(uint256 => MintInfo) public mintData;

    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event MarketplaceSet(address indexed previous, address indexed current);

    constructor() ERC721("MusicArt", "MART") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        address previous = marketplace;
        marketplace = _marketplace;
        emit MarketplaceSet(previous, _marketplace);
    }

    /// MINT con royalty
    function mint(
        address recipient,
        string memory tokenURI,
        address creator,
        uint96 royaltyBps    // ej: 500 = 5%
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);

        // registrar autor original
        mintData[tokenId] = MintInfo(creator);

        // fijar royalty
        _setTokenRoyalty(tokenId, creator, royaltyBps);

        emit Minted(recipient, tokenId, tokenURI);
        return tokenId;
    }

    function isApprovedForAll(address owner_, address operator)
        public
        view
        override(ERC721, IERC721)
        returns (bool)
    {
        if (operator == marketplace) {
            return true;
        }
        return super.isApprovedForAll(owner_, operator);
    }
}
